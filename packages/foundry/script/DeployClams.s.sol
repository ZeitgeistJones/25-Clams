// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;



import "./DeployHelpers.s.sol";

import {ClamsPool} from "../contracts/ClamsPool.sol";

import {ClamsGame} from "../contracts/ClamsGame.sol";



/**

 * @notice Deploy script for the "25 Clams" game.

 * @dev Deploy order:

 *      1. Deploy ClamsPool (CLAWD as underlying)

 *      2. Deploy ClamsGame with the pool address

 *      3. Register the game with the pool via initGame

 *

 * Example:

 *   yarn deploy --file DeployClams.s.sol

 */

contract DeployClams is ScaffoldETHDeploy {

    address constant CLAWD_TOKEN = 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07;

    address constant VRF_COORDINATOR = 0xd5D517aBE5cF79B7e95eC98dB0f0277788aFF634;

    bytes32 constant KEY_HASH = 0x00b81b5a830cb0a4009fbd8904de511e28631e62ce5ad231373d3cdad373ccab; // 2 gwei gas lane

    uint256 constant ENTRY_FEE = 1000 * 1e18; // 1000 CLAWD

    uint256 constant SUBSCRIPTION_ID = 63736905563293571959547379001391545733994117588324492977382360571674042723786; // real subscription ID



    function run() external ScaffoldEthDeployerRunner {

        ClamsPool pool = new ClamsPool(CLAWD_TOKEN);

        ClamsGame game = new ClamsGame(

            VRF_COORDINATOR, CLAWD_TOKEN, address(pool), ENTRY_FEE, KEY_HASH, SUBSCRIPTION_ID

        );

        pool.initGame(address(game));



        deployments.push(Deployment({name: "ClamsPool", addr: address(pool)}));

        deployments.push(Deployment({name: "ClamsGame", addr: address(game)}));

    }

}

