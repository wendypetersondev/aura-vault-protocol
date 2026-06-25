// cypress/e2e/portfolio.cy.ts

describe("Portfolio View", () => {
  beforeEach(() => {
    cy.intercept("GET", "**/total_assets*", { statusCode: 200, body: { total: "500000" } });
    cy.intercept("GET", "**/balance_of*", { statusCode: 200, body: { balance: "1000" } });
    cy.visit("/");
    cy.connectWallet();
  });

  it("displays total vault assets", () => {
    cy.get("[data-cy=total-assets]").should("be.visible").and("not.be.empty");
  });

  it("displays user share balance", () => {
    cy.get("[data-cy=share-balance]").should("contain", "1000");
  });

  it("displays current exchange rate / price-per-share", () => {
    cy.get("[data-cy=price-per-share]").should("be.visible");
  });

  it("shows portfolio section only when wallet is connected", () => {
    cy.get("[data-cy=portfolio-section]").should("be.visible");
    cy.disconnectWallet();
    cy.get("[data-cy=portfolio-section]").should("not.exist");
  });

  it("refreshes data when the refresh button is clicked", () => {
    cy.get("[data-cy=refresh-btn]").click();
    cy.get("[data-cy=total-assets]").should("be.visible");
  });
});
