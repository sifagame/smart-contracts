import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const SifaCurseModule = buildModule("SifaCurse", (m) => {
  const sifaCurse = m.contract("SifaCurse", [m.getParameter("owner")]);

  return { sifaCurse };
});

export default SifaCurseModule;
