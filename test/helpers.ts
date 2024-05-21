import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { ethers } from "hardhat";
import config from "../ignition/loadConfig";

export async function deployAll() {
  const [owner, otherAccount] = await ethers.getSigners();

  const SifaToken = await ethers.getContractFactory("SifaToken");
  const sifa = await SifaToken.deploy(owner);

  const Vault = await ethers.getContractFactory("Vault");
  const vault = await Vault.deploy(sifa);

  const VestingVault = await ethers.getContractFactory("VestingVault");
  const vestingVault = await VestingVault.deploy(sifa);

  const Emitter = await ethers.getContractFactory("Emitter");
  const emitter = await Emitter.deploy(owner, sifa, vault);

  const Faucet = await ethers.getContractFactory("Faucet");
  const faucet = await Faucet.deploy(
    sifa,
    ethers.parseEther("420"),
    60 * 60 * 24
  );

  const {
    abi: factoryAbi,
    bytecode: factoryBytecode,
  } = require("@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json");
  const UniswapFactory = await ethers.getContractFactory(
    factoryAbi,
    factoryBytecode,
    owner
  );
  const uniswapFactory = await UniswapFactory.deploy();

  const pool = ethers.ZeroAddress;
  const WETH = ethers.ZeroAddress;

  const price = ethers.parseEther(config.PublicSale.price.toString());
  const minSale = ethers.parseEther(config.PublicSale.minSale.toString());
  const maxSale = ethers.parseEther(config.PublicSale.maxSale.toString());
  const start = (await time.latest()) + 60 * 60 * 24;
  const duration = 60 * 60;
  const vestingCliff = start + 60 * 60 * 24;
  const vestingDuration = 60 * 60 * 12;

  const PublicSale = await ethers.getContractFactory("PublicSale");
  const sale = await PublicSale.deploy(
    owner,
    {
      token: sifa,
      emitter: emitter,
      vesting: vestingVault,
      factory: uniswapFactory,
      pool: pool,
      weth: WETH,
    },
    { price, minSale, maxSale },
    { start, duration, vestingCliff, vestingDuration }
  );

  return {
    sifa,
    vault,
    vestingVault,
    emitter,
    faucet,
    sale,
    owner,
    otherAccount,
  };
}
