import { useCallback } from "react";
import { WETH as WTOMO } from "@luaswap/sdk";
import { ethers } from "ethers";
import { getContract } from "../utils";
import { logTransaction } from "../utils/analytics-utils";

const useWeth = (chainId = 89) => {
    const wrapETH = useCallback(async (amount: ethers.BigNumber, signer: ethers.Signer) => {
            const wtomo = getContract("IWETH", WTOMO[88].address, signer);
            const gasLimit = await wtomo.estimateGas.deposit({
                value: amount
            });
            const tx = await wtomo.deposit({
                value: amount,
                gasLimit
            });
            return await logTransaction(tx, "WTOMO.deposit()");        
    }, []);

    const unwrapETH = useCallback(async (amount: ethers.BigNumber, signer: ethers.Signer) => {
        const wtomo = getContract("IWETH", WTOMO[88].address, signer);
        const gasLimit = await wtomo.estimateGas.withdraw(amount);
        const tx = await wtomo.withdraw(amount, {
            gasLimit
        });
        return await logTransaction(tx, "WTOMO.withdraw()");        
        
    }, []);

    return {
        wrapETH,
        unwrapETH
    };
};

export default useWeth;
