import { useCallback } from "react";

import { WETH } from "@sushiswap/sdk";
import { WETH as WTOMO } from "@luaswap/sdk";
import { WETH as WBNB } from "@pancakeswap-libs/sdk";
import { ethers } from "ethers";
import { getContract } from "../utils";
import { logTransaction } from "../utils/analytics-utils";

const useWeth = (chainId = 1) => {
    const wrapETH = useCallback(async (amount: ethers.BigNumber, signer: ethers.Signer) => {
        if (chainId === 56) {
            const wbnb = getContract("IWETH", WBNB[56].address, signer);
            const gasLimit = await wbnb.estimateGas.deposit({
                value: amount
            });
            const tx = await wbnb.deposit({
                value: amount,
                gasLimit
            });
            return await logTransaction(tx, "WBNB.deposit()");
        } else {
            const weth = getContract("IWETH", WETH[1].address, signer);
            const gasLimit = await weth.estimateGas.deposit({
                value: amount
            });
            const tx = await weth.deposit({
                value: amount,
                gasLimit
            });
            return await logTransaction(tx, "WETH.deposit()");
        }
    }, []);

    const unwrapETH = useCallback(async (amount: ethers.BigNumber, signer: ethers.Signer) => {
        if (chainId === 56) {
            const wbnb = getContract("IWETH", WBNB[56].address, signer);
            const gasLimit = await wbnb.estimateGas.withdraw(amount);
            const tx = await wbnb.withdraw(amount, {
                gasLimit
            });
            return await logTransaction(tx, "WBNB.withdraw()");
        } else {
            const weth = getContract("IWETH", WETH[1].address, signer);
            const gasLimit = await weth.estimateGas.withdraw(amount);
            const tx = await weth.withdraw(amount, {
                gasLimit
            });
            return await logTransaction(tx, "WETH.withdraw()");
        }
        
    }, []);

    return {
        wrapETH,
        unwrapETH
    };
};

export default useWeth;
