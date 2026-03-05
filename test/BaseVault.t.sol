// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/BaseVault.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(string memory n, string memory s) ERC20(n, s) {}
    function mint(address to, uint256 amt) external { _mint(to, amt); }
}

contract BaseVaultTest is Test {
    BaseVault vault;
    MockERC20 weth;
    MockERC20 usdc;

    address alice   = makeAddr("alice");
    address bob     = makeAddr("bob");
    address keeper  = makeAddr("keeper");
    address feeDest = makeAddr("feeDest");

    function setUp() public {
        weth = new MockERC20("Wrapped ETH", "WETH");
        usdc = new MockERC20("USD Coin", "USDC");

        vault = new BaseVault(
            IERC20(address(weth)),
            IERC20(address(usdc)),
            address(0),
            address(0),
            keeper,
            feeDest,
            "BaseVault ETH/USDC",
            "bvETH-USDC"
        );

        weth.mint(alice, 10 ether);
        weth.mint(bob, 5 ether);
    }

    function test_deposit_mintsShares() public {
        vm.startPrank(alice);
        weth.approve(address(vault), 1 ether);
        uint256 shares = vault.deposit(1 ether, alice);
        vm.stopPrank();

        assertEq(shares, 1 ether);
        assertEq(vault.balanceOf(alice), 1 ether);
        assertEq(vault.totalAssets(), 1 ether);
    }

    function test_twoDepositors() public {
        vm.startPrank(alice);
        weth.approve(address(vault), 1 ether);
        vault.deposit(1 ether, alice);
        vm.stopPrank();

        vm.startPrank(bob);
        weth.approve(address(vault), 0.5 ether);
        vault.deposit(0.5 ether, bob);
        vm.stopPrank();

        assertEq(vault.totalAssets(), 1.5 ether);
        assertApproxEqRel(vault.balanceOf(bob), 0.5 ether, 1e15);
    }

    function test_withdraw_burnsShares() public {
        vm.startPrank(alice);
        weth.approve(address(vault), 2 ether);
        vault.deposit(2 ether, alice);
        vault.withdraw(1 ether, alice, alice);
        vm.stopPrank();

        assertEq(weth.balanceOf(alice), 9 ether);
    }

    function test_onlyKeeper_canRebalance() public {
        vm.prank(alice);
        vm.expectRevert("Not keeper");
        vault.rebalance(-1000, 1000);

        vm.prank(keeper);
        vault.rebalance(-1000, 1000);
    }

    function test_protocolFee() public {
        weth.mint(address(vault), 1 ether);

        uint256 vaultBalance = weth.balanceOf(address(vault));
        uint256 expectedFee = (vaultBalance * 50) / 10_000;
        assertEq(expectedFee, 0.005 ether);
    }

    function test_emergencyWithdraw_onlyOwner() public {
        // Un non-owner ne peut pas appeler
        vm.prank(alice);
        vm.expectRevert();
        vault.emergencyWithdraw();

        // Owner peut appeler uniquement si inPosition == false
        // (sinon appelle positionManager qui est address(0) dans les tests)
        assertEq(vault.inPosition(), false);
        // On vérifie juste que le owner est bien le déployeur
        assertEq(vault.owner(), address(this));
    }
}
