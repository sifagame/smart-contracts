import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const VaultModule = buildModule("Vault", (m) => {
  const vault = m.contract("Vault", [
    m.getParameter("token"),
    m.getParameter("owner"),
  ]);

  return { vault };
});

export default VaultModule;
