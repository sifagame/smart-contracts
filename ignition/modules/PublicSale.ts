import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const PublicSaleModule = buildModule("PublicSale", (m) => {
  const publicSale = m.contract("PublicSale", [
    m.getParameter("owner"),
    m.getParameter("token"),
    m.getParameter("emitter"),
    m.getParameter("vesting"),
    m.getParameter("factory"),
    m.getParameter("price"),
    m.getParameter("minSale"),
    m.getParameter("maxSale"),
    m.getParameter("start"),
    m.getParameter("duration"),
    m.getParameter("vestingCliff"),
    m.getParameter("vestingDuration"),
  ]);

  return { publicSale };
});

export default PublicSaleModule;
