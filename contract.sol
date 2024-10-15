// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract IPFSStorage {
    event HashStored(string ipfsHash);

    function storeHash(string memory ipfsHash) public {
        emit HashStored(ipfsHash);
    }
}