import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const PublicSaleModule = buildModule("PublicSale", (m) => {
  const publicSale = m.contract("PublicSale", [
    m.getParameter("initialOwner_"),
	m.getParameter("contracts_"),
    m.getParameter("priceSettings_"),
    m.getParameter("dateSettings_"),
  ]);

  return { publicSale };
});

export default PublicSaleModule;
