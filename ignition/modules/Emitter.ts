import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const EmitterModule = buildModule("Emitter", (m) => {
  const emitter = m.contract("Emitter", [
    m.getParameter("owner"),
    m.getParameter("token"),
    m.getParameter("vault"),
  ]);

  return { emitter };
});

export default EmitterModule;
