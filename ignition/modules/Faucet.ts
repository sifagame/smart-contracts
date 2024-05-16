import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const FaucetModule = buildModule("Faucet", (m) => {
  const faucet = m.contract("Faucet", [
    m.getParameter("token"),
    m.getParameter("dropAmount"),
    m.getParameter("delay"),
  ]);

  return { faucet };
});

export default FaucetModule;
