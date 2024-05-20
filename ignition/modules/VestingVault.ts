import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const VestingVaultModule = buildModule("VestingVault", (m) => {
  const vestingVault = m.contract("VestingVault", [m.getParameter("token")]);

  return { vestingVault };
});

export default VestingVaultModule;
