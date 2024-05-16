import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const SifaTokenModule = buildModule("SifaToken", (m) => {
  const sifaToken = m.contract("SifaToken", [m.getParameter("owner")]);

  return { sifaToken };
});

export default SifaTokenModule;
