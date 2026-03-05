// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/BaseVault.sol";

contract DeployBaseVault is Script {
    // Adresses Base Sepolia
    address constant WETH      = 0x4200000000000000000000000000000000000006;
    address constant USDC      = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address constant UNI_V3_PM = 0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2;
    address constant POOL      = 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer    = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        BaseVault vault = new BaseVault(
            IERC20(WETH),
            IERC20(USDC),
            UNI_V3_PM,
            POOL,
            deployer,
            deployer,
            "BaseVault ETH/USDC",
            "bvETH-USDC"
        );

        console.log("BaseVault deployed at:", address(vault));
        console.log("Deployer:", deployer);

        vm.stopBroadcast();
    }
}