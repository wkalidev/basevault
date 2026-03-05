// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

/**
 * @title BaseVault
 * @notice ERC-4626 vault qui dépose la liquidité dans Uniswap V3 sur Base
 * @dev Les users déposent un token ERC-20, reçoivent des "shares".
 *      Un keeper externe appelle rebalance() quand le prix sort du range.
 */
contract BaseVault is ERC4626, Ownable, ReentrancyGuard {

    // ── CONSTANTS ──────────────────────────────────────────────
    uint256 public constant PROTOCOL_FEE_BPS = 50; // 0.5%
    uint256 public constant BPS = 10_000;

    // ── STATE ──────────────────────────────────────────────────
    INonfungiblePositionManager public immutable positionManager;
    IUniswapV3Pool              public immutable pool;
    IERC20                      public immutable token1; // paired token

    address public keeper;
    address public feeRecipient;

    uint256 public tokenId;
    int24   public tickLower;
    int24   public tickUpper;
    bool    public inPosition;

    // ── EVENTS ─────────────────────────────────────────────────
    event Rebalanced(int24 newLower, int24 newUpper, uint256 liquidity);
    event FeesCollected(uint256 amount0, uint256 amount1);
    event KeeperUpdated(address newKeeper);

    // ── MODIFIERS ──────────────────────────────────────────────
    modifier onlyKeeper() {
        require(msg.sender == keeper || msg.sender == owner(), "Not keeper");
        _;
    }

    // ── CONSTRUCTOR ────────────────────────────────────────────
    constructor(
        IERC20  _asset,
        IERC20  _token1,
        address _positionManager,
        address _pool,
        address _keeper,
        address _feeRecipient,
        string memory _name,
        string memory _symbol
    )
        ERC4626(_asset)
        ERC20(_name, _symbol)
    {
        _transferOwnership(msg.sender); // OZ v4 compatible
        positionManager = INonfungiblePositionManager(_positionManager);
        pool            = IUniswapV3Pool(_pool);
        token1          = _token1;
        keeper          = _keeper;
        feeRecipient    = _feeRecipient;
    }

    // ── ERC-4626 OVERRIDES ─────────────────────────────────────

    function deposit(uint256 assets, address receiver)
        public override nonReentrant returns (uint256 shares)
    {
        shares = super.deposit(assets, receiver);
        if (inPosition) {
            _increaseLiquidity(assets);
        }
    }

    function withdraw(uint256 assets, address receiver, address owner_)
        public override nonReentrant returns (uint256 shares)
    {
        if (inPosition) {
            _decreaseLiquidity(_assetsToliquidity(assets));
        }
        shares = super.withdraw(assets, receiver, owner_);
    }

    function totalAssets() public view override returns (uint256) {
        uint256 directBalance = IERC20(asset()).balanceOf(address(this));
        uint256 positionValue  = inPosition ? _estimatePositionValue() : 0;
        return directBalance + positionValue;
    }

    // ── KEEPER FUNCTIONS ───────────────────────────────────────

    function rebalance(int24 newLower, int24 newUpper)
        external onlyKeeper nonReentrant
    {
        require(newLower < newUpper, "Invalid ticks");

        if (inPosition && tokenId != 0) {
            _removeAllLiquidity();
            _collectFees();
        }

        uint256 balance = IERC20(asset()).balanceOf(address(this));
        uint256 fee = (balance * PROTOCOL_FEE_BPS) / BPS;
        if (fee > 0) {
            IERC20(asset()).transfer(feeRecipient, fee);
        }

        tickLower = newLower;
        tickUpper = newUpper;
        uint256 newBalance = IERC20(asset()).balanceOf(address(this));

        if (newBalance > 0) {
            _openPosition(newBalance, newLower, newUpper);
        }

        emit Rebalanced(newLower, newUpper, newBalance);
    }

    function compound() external onlyKeeper nonReentrant {
        require(inPosition, "No active position");
        _collectFees();
        uint256 bal = IERC20(asset()).balanceOf(address(this));
        if (bal > 0) {
            _increaseLiquidity(bal);
        }
    }

    // ── INTERNAL ───────────────────────────────────────────────

    function _openPosition(uint256 amount, int24 lower, int24 upper) internal {
        IERC20(asset()).approve(address(positionManager), amount);

        INonfungiblePositionManager.MintParams memory params =
            INonfungiblePositionManager.MintParams({
                token0:         asset(),
                token1:         address(token1),
                fee:            pool.fee(),
                tickLower:      lower,
                tickUpper:      upper,
                amount0Desired: amount,
                amount1Desired: 0,
                amount0Min:     0,
                amount1Min:     0,
                recipient:      address(this),
                deadline:       block.timestamp + 300
            });

        (uint256 _tokenId,,,) = positionManager.mint(params);
        tokenId    = _tokenId;
        inPosition = true;
    }

    function _increaseLiquidity(uint256 amount) internal {
        IERC20(asset()).approve(address(positionManager), amount);
        INonfungiblePositionManager.IncreaseLiquidityParams memory p =
            INonfungiblePositionManager.IncreaseLiquidityParams({
                tokenId:        tokenId,
                amount0Desired: amount,
                amount1Desired: 0,
                amount0Min:     0,
                amount1Min:     0,
                deadline:       block.timestamp + 300
            });
        positionManager.increaseLiquidity(p);
    }

    function _removeAllLiquidity() internal {
        (,,,,,,, uint128 liquidity,,,,) = positionManager.positions(tokenId);
        if (liquidity == 0) return;

        INonfungiblePositionManager.DecreaseLiquidityParams memory p =
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId:    tokenId,
                liquidity:  liquidity,
                amount0Min: 0,
                amount1Min: 0,
                deadline:   block.timestamp + 300
            });
        positionManager.decreaseLiquidity(p);
        inPosition = false;
    }

    function _decreaseLiquidity(uint128 liquidity) internal {
        INonfungiblePositionManager.DecreaseLiquidityParams memory p =
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId:    tokenId,
                liquidity:  liquidity,
                amount0Min: 0,
                amount1Min: 0,
                deadline:   block.timestamp + 300
            });
        positionManager.decreaseLiquidity(p);
    }

    function _collectFees() internal {
        INonfungiblePositionManager.CollectParams memory p =
            INonfungiblePositionManager.CollectParams({
                tokenId:    tokenId,
                recipient:  address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            });
        (uint256 a0, uint256 a1) = positionManager.collect(p);
        emit FeesCollected(a0, a1);
    }

    function _estimatePositionValue() internal view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this));
    }

    function _assetsToliquidity(uint256 assets) internal view returns (uint128) {
        uint256 total = totalAssets();
        if (total == 0) return 0;
        return uint128((assets * 1e18) / total);
    }

    // ── ADMIN ──────────────────────────────────────────────────

    function setKeeper(address _keeper) external onlyOwner {
        keeper = _keeper;
        emit KeeperUpdated(_keeper);
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        feeRecipient = _feeRecipient;
    }

    function emergencyWithdraw() external onlyOwner {
        if (inPosition) _removeAllLiquidity();
        _collectFees();
        inPosition = false;
    }
}
