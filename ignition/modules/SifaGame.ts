import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const SifaGameModule = buildModule("SifaGame", (m) => {
  const sifaGame = m.contract("SifaGame", [
    m.getParameter("token"),
    m.getParameter("curse"),
    m.getParameter("vault"),
  ]);

  return { sifaGame };
});

export default SifaGameModule;
