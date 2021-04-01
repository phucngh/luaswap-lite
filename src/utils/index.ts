import { ChainId, CurrencyAmount, Percent, Token as SDKToken, TokenAmount, WETH } from "@sushiswap/sdk";
import { ethers } from "ethers";
import { BNB, ETH, TOMO } from "../constants/tokens";
import Token from "../types/Token";
import getContract from "./getContract";

export const formatUSD = (value: number, maxFraction = 0) => {
    const formatter = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: maxFraction
    });
    return formatter.format(value);
};

export const formatPercentage = (value: number, maxFraction = 2) => {
    const formatted = String(value * 100);
    if (maxFraction > 0) {
        const split = formatted.split(".");
        if (split.length > 1) {
            return split[0] + "." + split[1].substr(0, maxFraction);
        }
    }
    return formatted;
};

export const formatBalance = (value: ethers.BigNumberish, decimals = 18, maxFraction = 0) => {
    const formatted = ethers.utils.formatUnits(value, decimals);
    if (maxFraction > 0) {
        const split = formatted.split(".");
        if (split.length > 1) {
            return split[0] + "." + split[1].substr(0, maxFraction);
        }
    }
    return formatted;
};

export const parseBalance = (value: string, decimals = 18) => {
    return ethers.utils.parseUnits(value || "0", decimals);
};

export const isEmptyValue = (text: string) =>
    ethers.BigNumber.isBigNumber(text)
        ? ethers.BigNumber.from(text).isZero()
        : text === "" || text.replace(/0/g, "").replace(/\./, "") === "";

export const isNativeToken = (token?: Token) => {
    return token?.address.toLowerCase() === ETH.address.toLowerCase();
}

export const isWrappedNativeToken = (token?: Token, chainId = 1) => {
    if (chainId === 88) {
        return token?.address.toLowerCase() === "0xb1f66997a5760428d3a87d68b90bfe0ae64121cc";
    } else if(chainId === 56) {
        return token?.address.toLowerCase() === "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
    } else {
        return token?.address.toLowerCase() === WETH[1].address.toLowerCase();
    }
}

export const isNativeAndWrappedNativePair = (chainId = 1, fromToken?: Token, toToken?: Token) => {
    return (isNativeToken(fromToken) && isWrappedNativeToken(toToken, chainId)) || (isWrappedNativeToken(fromToken, chainId) && isNativeToken(toToken));
};

export const convertToken = (token: Token) => {
    return token.symbol === "ETH" ? WETH["1"] : new SDKToken(ChainId.MAINNET, token.address, token.decimals);
};

export const convertAmount = (token: Token, amount: string) => {
    return new TokenAmount(convertToken(token), parseBalance(amount, token.decimals).toString());
};

export const parseCurrencyAmount = (value: CurrencyAmount, decimals = 18) => {
    return ethers.BigNumber.from(parseBalance(value.toExact(), decimals));
};

export const deduct = (amount: ethers.BigNumber, percent: Percent) => {
    return amount.sub(amount.mul(percent.numerator.toString()).div(percent.denominator.toString()));
};

export const pow10 = (exp: ethers.BigNumberish) => {
    return ethers.BigNumber.from(10).pow(exp);
};

export const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US") + " " + date.toLocaleTimeString("en-US");
};

export { getContract };
