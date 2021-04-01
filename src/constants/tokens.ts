import { ethers } from "ethers";
import Token from "../types/Token";

export const ETH: Token = {
    name: "Ethereum",
    address: ethers.constants.AddressZero,
    decimals: 18,
    symbol: "ETH",
    logoURI: "https://lite.sushi.com/images/tokens/ETH.png",
    balance: ethers.BigNumber.from(0)
};

export const TOMO: Token = {
    name: "TomoChain",
    address: ethers.constants.AddressZero,
    decimals: 18,
    symbol: "TOMO",
    logoURI: "https://lite.sushi.com/images/tokens/ETH.png",
    balance: ethers.BigNumber.from(0)
};

export const BNB: Token = {
    name: "Binance Coin",
    address: ethers.constants.AddressZero,
    decimals: 18,
    symbol: "BNB",
    logoURI: "https://lite.sushi.com/images/tokens/ETH.png",
    balance: ethers.BigNumber.from(0)
};
