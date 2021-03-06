import { FACTORY_ADDRESS as SUSHISWAP_FACTORY, Pair } from "@pancakeswap-libs/sdk";
import luaData from "../../lua-data.js";
import { FACTORY_ADDRESS as UNISWAP_FACTORY } from "@uniswap/sdk";
import { ethers } from "ethers";
import _ from "lodash";
import { LP_TOKEN_SCANNER, MASTER_CHEF, ORDER_BOOK, SETTLEMENT } from "../constants/contracts";
import Fraction from "../constants/Fraction";
import { BNB, ETH, TOMO } from "../constants/tokens";
import { ALCHEMY_PROVIDER, KOVAN_PROVIDER, TOMOCHAIN_MAINET_PROVIDER, BSC_MAINET_PROVIDER } from "../context/EthersContext";
import { Order, OrderStatus } from "../hooks/useSettlement";
import LPToken from "../types/LPToken";
import Token from "../types/Token";
import TokenWithValue from "../types/TokenWithValue";
import {
    convertToken,
    formatBalance,
    getContract,
    isNativeToken,
    isWrappedNativeToken,
    parseBalance,
    parseCurrencyAmount,
    pow10
} from "./index";

const blocksPerDay = 6500;

export const fetchTokens = async (provider: ethers.providers.BaseProvider, account: string, customTokens?: Token[]) => {
    // FIXME: Hard code to test, need to fetch from uri
    // const response = await fetch("https://lite.sushi.com/tokens.json");
    // const json = await response.json();
    const json = {
        "name": "SushiSwap Token List",
        "timestamp": "2020-11-26T00:00:00+00:00",
        "version": {
            "major": 1,
            "minor": 0,
            "patch": 0
        },
        "logoURI": "https://lite.sushi.com/logo.png",
        "keywords": [
            "nomichef",
            "default",
            "list"
        ],
        "tokens": [
            {
            "address": "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
            "chainId": 56,
            "name": "Ethereum Token",
            "symbol": "ETH",
            "decimals": 18,
            "logoURI": "https://lite.sushi.com/images/tokens/ETH.png"
            },
            {
            "address": "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
            "chainId": 56,
            "name": "Wrapped BNB",
            "symbol": "WBNB",
            "decimals": 18,
            "logoURI": "https://exchange.pancakeswap.finance/images/coins/bnb.png"
            },
            {
            "address": "0xe9e7cea3dedca5984780bafc599bd69add087d56",
            "chainId": 56,
            "name": "BUSD Token",
            "symbol": "BUSD",
            "decimals": 18,
            "logoURI": "https://exchange.pancakeswap.finance/images/coins/0xe9e7cea3dedca5984780bafc599bd69add087d56.png"
            }
    ]
    }
    const tokens = [...json.tokens, ...(customTokens || [])]

    const balances = await fetchTokenBalances(
        provider,
        account,
        tokens.map(token => token.address)
    );
    return [
        {
            ...BNB,
            balance: await provider.getBalance(account)
        },
        ...tokens.map((token, i) => ({
            ...token,
            balance: ethers.BigNumber.from(balances[i] || 0)
        }))
    ];
};

export const fetchTokenWithValue = async (
    token: Token,
    weth: Token,
    wethPriceUSD: Fraction,
    getPair: (fromToken: Token, toToken: Token, provider: ethers.providers.BaseProvider) => Promise<Pair>,
    provider: ethers.providers.BaseProvider
) => {
    let fetched: TokenWithValue;
    if (isNativeToken(token) || isWrappedNativeToken(token)) {
        fetched = {
            ...token,
            priceUSD: Number(wethPriceUSD.toString()),
            valueUSD: Number(formatBalance(wethPriceUSD.apply(token.balance)))
        } as TokenWithValue;
    } else {
        try {
            const pair = await getPair(token, weth, provider);
            const priceETH = Fraction.convert(pair.priceOf(convertToken(token)));
            const priceUSD = priceETH.apply(wethPriceUSD.numerator).div(pow10(18 - token.decimals));
            fetched = {
                ...token,
                priceUSD: Number(formatBalance(priceUSD)),
                valueUSD: Number(formatBalance(priceUSD.mul(token.balance).div(pow10(token.decimals))))
            } as TokenWithValue;
        } catch (e) {
            fetched = { ...token, priceUSD: null, valueUSD: null } as TokenWithValue;
        }
    }
    return fetched;
};

// tslint:disable-next-line:max-func-body-length
export const fetchPools = async (account: string, tokens: Token[], provider: ethers.providers.JsonRpcProvider) => {
    const info = await luaData.sushi.info();
    const masterchefInfo = await luaData.masterchef.info();
    const pools = await luaData.masterchef.pools();
    const reduce = await luaData.masterchef.pool({ poolId: "45" });
    if (!reduce) return undefined;
    const sushiPerBlock = Math.floor(100 - 100 * (reduce.allocPoint / masterchefInfo.totalAllocPoint));
    const balances = await fetchTokenBalances(
        provider,
        account,
        pools.map(pool => pool.pair)
    );
    // tslint:disable-next-line:max-func-body-length
    const fetchPool = async (pool, i): Promise<LPToken | null> => {
        if (pool.slpBalance === 0) return null;
        try {
            const result = await Promise.all([
                fetchStakedValue(pool.pair),
                fetchPairTokens(pool.pair, tokens, provider)
            ]);
            if (!result[0]) return null;
            const apy = calcAPY(
                info.derivedETH,
                sushiPerBlock,
                pool.allocPoint,
                masterchefInfo.totalAllocPoint,
                result[0].totalValueETH,
                pool.slpBalance,
                result[0].totalSupply
            );
            if (apy === 0) return null;
            return {
                ...pool,
                apy,
                address: pool.pair,
                decimals: 18,
                tokenA: result[1].tokenA,
                tokenB: result[1].tokenB,
                symbol: result[1].tokenA.symbol + "-" + result[1].tokenB.symbol + " LP",
                balance: ethers.BigNumber.from(balances[i] || 0),
                sushiRewardedPerYear: calcSushiRewardedPerYear(
                    sushiPerBlock,
                    pool.allocPoint,
                    masterchefInfo.totalAllocPoint,
                    result[0].totalSupply
                ),
                totalSupply: parseBalance(String(result[0].totalSupply), 18),
                totalValueUSD: result[0].totalValueUSD,
                multiplier: pool.allocPoint / 1000
            };
        } catch (e) {
            return null;
        }
    };
    return (await Promise.all(pools.map(fetchPool))).filter(pool => !!pool) as LPToken[];
};

export const fetchMyPools = async (account: string, tokens: Token[], provider: ethers.providers.JsonRpcProvider) => {
    const pools = await luaData.masterchef.pools();
    const fetchMyPool = async (pool): Promise<LPToken | null> => {
        try {
            const myStake = await fetchMyStake(pool.id, account, provider);
            if (myStake.amountDeposited.isZero()) return null;
            const result = await Promise.all([
                fetchStakedValue(pool.pair),
                fetchPairTokens(pool.pair, tokens, provider)
            ]);
            return {
                ...pool,
                address: pool.pair,
                decimals: 18,
                tokenA: result[1].tokenA,
                tokenB: result[1].tokenB,
                symbol: result[1].tokenA.symbol + "-" + result[1].tokenB.symbol + " LP",
                balance: ethers.constants.Zero,
                amountDeposited: myStake.amountDeposited,
                pendingSushi: myStake.pendingSushi,
                totalSupply: parseBalance(String(result[0].totalSupply), 18)
            };
        } catch (e) {
            return null;
        }
    };
    return (await Promise.all(pools.map(fetchMyPool))).filter(pool => !!pool) as LPToken[];
};

const calcAPY = (derivedETH, sushiPerBlock, allocPoint, totalAllocPoint, totalValueETH, slpBalance, totalSupply) => {
    return (
        (derivedETH * blocksPerDay * sushiPerBlock * 3 * 365 * (allocPoint / totalAllocPoint)) /
        (totalValueETH * (slpBalance / totalSupply))
    );
};

const calcSushiRewardedPerYear = (sushiPerBlock, allocPoint, totalAllocPoint, totalSupply) => {
    return ethers.BigNumber.from(blocksPerDay * sushiPerBlock * 3 * 365 * allocPoint)
        .mul(pow10(36))
        .div(totalAllocPoint)
        .div(parseBalance(String(totalSupply)));
};

const fetchStakedValue = async (lpToken: string) => {
    return await luaData.masterchef.stakedValue({ lpToken });
};

const fetchMyStake = async (poolId: number, account: string, provider: ethers.providers.JsonRpcProvider) => {
    const masterChef = getContract("MasterChef", MASTER_CHEF, provider);
    const { amount: amountDeposited } = await masterChef.userInfo(poolId, account);
    const pendingSushi = await masterChef.pendingSushi(poolId, account);
    return { amountDeposited, pendingSushi };
};

const fetchPairTokens = async (pair: string, tokens: Token[], provider: ethers.providers.JsonRpcProvider) => {
    const contract = getContract("IUniswapV2Pair", pair, provider);
    const tokenA = await findOrFetchToken(await contract.token0(), provider, tokens);
    const tokenB = await findOrFetchToken(await contract.token1(), provider, tokens);
    return { tokenA, tokenB };
};

export const fetchMyLPTokens = async (account: string, tokens: Token[], provider: ethers.providers.JsonRpcProvider) => {
    return await fetchLPTokens(SUSHISWAP_FACTORY, account, tokens, provider);
};

export const fetchMyUniswapLPTokens = async (
    account: string,
    tokens: Token[],
    provider: ethers.providers.JsonRpcProvider
) => {
    return await fetchLPTokens(UNISWAP_FACTORY, account, tokens, provider);
};

const LP_TOKENS_LIMIT = 100;

// tslint:disable-next-line:max-func-body-length
const fetchLPTokens = async (
    factory: string,
    account: string,
    tokens: Token[],
    provider: ethers.providers.JsonRpcProvider
) => {
    const factoryContract = getContract("IUniswapV2Factory", factory, provider);
    const length = await factoryContract.allPairsLength();
    const scanner = getContract("LPTokenScanner", LP_TOKEN_SCANNER, provider);
    const pages: number[] = [];
    for (let i = 0; i < length; i += LP_TOKENS_LIMIT) pages.push(i);
    const pairs = (
        await Promise.all(
            pages.map(page =>
                scanner.findPairs(account, factory, page, Math.min(page + LP_TOKENS_LIMIT, length.toNumber()))
            )
        )
    ).flat();
    const balances = await fetchTokenBalances(
        provider,
        account,
        pairs.map(pair => pair.token)
    );
    return await Promise.all(
        pairs.map(async (pair, index) => {
            const erc20 = getContract("ERC20", pair.token, provider);
            const result = await Promise.all([
                erc20.decimals(),
                erc20.totalSupply(),
                fetchPairTokens(pair.token, tokens, provider)
            ]);
            return {
                address: pair.token,
                decimals: Number(result[0]),
                name: result[2].tokenA.symbol + "-" + result[2].tokenB.symbol + " LP Token",
                symbol: result[2].tokenA.symbol + "-" + result[2].tokenB.symbol,
                balance: ethers.BigNumber.from(balances[index]),
                totalSupply: result[1],
                tokenA: result[2].tokenA,
                tokenB: result[2].tokenB
            } as LPToken;
        })
    );
};

export const findOrFetchToken = async (
    address: string,
    provider: ethers.providers.JsonRpcProvider,
    tokens?: Token[]
) => {
    if (tokens) {
        const token = tokens.find(t => t.address.toLowerCase() === address.toLowerCase());
        if (token) {
            return token;
        }
    }
    // let meta = await ALCHEMY_PROVIDER.send("alchemy_getTokenMetadata", [address]);
    // if (!meta.name || meta.symbol || meta.decimals || meta.logoURI) {
    //     meta = await fetchTokenMeta(address, provider);
    // }
    let meta = await fetchTokenMeta(address, provider);
    return {
        address,
        name: meta.name,
        symbol: meta.symbol,
        decimals: meta.decimals,
        logoURI: meta.logoURI,
        balance: ethers.constants.Zero
    } as Token;
};

const fetchTokenMeta = async (address: string, provider: ethers.providers.JsonRpcProvider) => {
    const erc20 = getContract("ERC20", address, provider);
    const data = await Promise.all(
        ["name", "symbol", "decimals"].map(field => {
            try {
                return erc20.callStatic[field]();
            } catch (e) {
                return "";
            }
        })
    );
    return {
        name: data[0],
        symbol: data[1],
        decimals: data[2],
        logoURI: ""
    };
};

export const fetchLPTokenWithValue = async (
    lpToken: LPToken,
    weth: Token,
    wethPriceUSD: Fraction,
    getPair: (fromToken: Token, toToken: Token, provider: ethers.providers.BaseProvider) => Promise<Pair>,
    provider: ethers.providers.BaseProvider
) => {
    const pair = await getPair(lpToken.tokenA, lpToken.tokenB, provider);
    const values = await Promise.all([
        await fetchTotalValue(lpToken.tokenA, pair, weth, wethPriceUSD, getPair, provider),
        await fetchTotalValue(lpToken.tokenB, pair, weth, wethPriceUSD, getPair, provider)
    ]);
    const priceUSD = values[0]
        .add(values[1])
        .mul(pow10(18))
        .div(lpToken.totalSupply);
    return {
        ...lpToken,
        priceUSD: Number(formatBalance(priceUSD)),
        valueUSD: Number(
            formatBalance(priceUSD.mul(lpToken.amountDeposited || lpToken.balance).div(pow10(lpToken.decimals)))
        )
    };
};

const fetchTotalValue = async (token: Token, lpPair: Pair, weth: Token, wethPriceUSD: Fraction, getPair, provider) => {
    const tokenWithValue = await fetchTokenWithValue(token, weth, wethPriceUSD, getPair, provider);
    const tokenReserve = parseCurrencyAmount(lpPair.reserveOf(convertToken(token)), token.decimals);
    const tokenPrice = parseBalance(String(tokenWithValue.priceUSD || 0));
    return tokenReserve.mul(tokenPrice).div(pow10(token.decimals));
};

const fetchTokenBalances = async (provider: ethers.providers.BaseProvider, account: string, addresses: string[]) => {

    const balances = await Promise.all(addresses.map(async (address) => {

        const erc20 = getContract("ERC20", address, provider);
        const tokenBalance = await erc20.balanceOf(account);
        return {
            tokenBalance: tokenBalance,
            contractAddress: address
        };
    }))

    // const balances = await ALCHEMY_PROVIDER.send("alchemy_getTokenBalances", [account, addresses]);
    // return balances.tokenBalances.map(balance => balance.tokenBalance);
    return balances.map(balance => balance.tokenBalance);
};

const LIMIT_ORDERS_LIMIT = 20;

export const fetchMyLimitOrders = async (
    provider: ethers.providers.JsonRpcProvider,
    signer: ethers.Signer,
    tokens?: Token[],
    canceledHashes?: string[]
) => {
    const orderBook = getContract("OrderBook", ORDER_BOOK, BSC_MAINET_PROVIDER);
    const settlement = await getContract("Settlement", SETTLEMENT, provider);
    const maker = await signer.getAddress();
    const length = await orderBook.numberOfHashesOfMaker(maker);
    const pages: number[] = [];
    for (let i = 0; i * LIMIT_ORDERS_LIMIT < length; i++) pages.push(i);
    const hashes = (await Promise.all(pages.map(page => orderBook.hashesOfMaker(maker, page, LIMIT_ORDERS_LIMIT))))
        .flat()
        .filter(hash => hash !== ethers.constants.HashZero);
    const myOrders = await Promise.all(
        hashes.map(async hash => {
            const args = await orderBook.orderOfHash(hash);
            return new Order(
                signer,
                await findOrFetchToken(args.fromToken, provider, tokens),
                await findOrFetchToken(args.toToken, provider, tokens),
                args.amountIn,
                args.amountOutMin,
                args.recipient,
                args.deadline,
                args.v,
                args.r,
                args.s,
                await settlement.filledAmountInOfHash(hash),
                canceledHashes && canceledHashes.includes(hash)
            );
        })
    );
    return myOrders.sort(compareOrders) as Order[];
};

const compareOrders = (o0, o1) => {
    const status = (s: OrderStatus) => (s === "Open" ? 0 : s === "Filled" ? 1 : 2);
    const compared = status(o0.status()) - status(o1.status());
    return compared === 0 ? o1.deadline.toNumber() - o0.deadline.toNumber() : compared;
};
