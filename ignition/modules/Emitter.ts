import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const EmitterModule = buildModule("Emitter", (m) => {
  const emitter = m.contract("Emitter", [
    m.getParameter("token"),
    m.getParameter("vault"),
    m.getParameter("owner"),
  ]);

  return { emitter };
});

export default EmitterModule;
