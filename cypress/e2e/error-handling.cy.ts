// cypress/e2e/error-handling.cy.ts

describe("Error Handling", () => {
  beforeEach(() => {
    cy.visit("/");
    cy.connectWallet();
  });

  it("shows error toast when deposit transaction fails", () => {
    cy.intercept("POST", "**/transactions/submit*", { statusCode: 500, body: { error: "Transaction failed" } });
    cy.get("[data-cy=deposit-amount]").type("100");
    cy.get("[data-cy=deposit-submit]").click();
    cy.get("[data-cy=error-toast]", { timeout: 8000 }).should("be.visible");
  });

  it("shows error toast when withdrawal transaction fails", () => {
    cy.intercept("POST", "**/transactions/submit*", { statusCode: 500, body: { error: "InsufficientShares" } });
    cy.get("[data-cy=withdraw-shares]").type("10");
    cy.get("[data-cy=withdraw-submit]").click();
    cy.get("[data-cy=error-toast]", { timeout: 8000 }).should("be.visible");
  });

  it("shows fallback UI when vault data fetch fails", () => {
    cy.intercept("GET", "**/total_assets*", { statusCode: 503 });
    cy.reload();
    cy.connectWallet();
    cy.get("[data-cy=data-error]").should("be.visible");
  });

  it("handles wallet not installed gracefully", () => {
    cy.window().then((win) => {
      delete (win as any).freighterApi;
    });
    cy.get("[data-cy=disconnect-wallet-btn]").click();
    cy.get("[data-cy=connect-wallet-btn]").click();
    cy.get("[data-cy=wallet-error]").should("be.visible");
  });

  it("dismisses error toast when close is clicked", () => {
    cy.intercept("POST", "**/transactions/submit*", { statusCode: 500 });
    cy.get("[data-cy=deposit-amount]").type("100");
    cy.get("[data-cy=deposit-submit]").click();
    cy.get("[data-cy=error-toast]", { timeout: 8000 }).should("be.visible");
    cy.get("[data-cy=toast-close]").click();
    cy.get("[data-cy=error-toast]").should("not.exist");
  });
});
