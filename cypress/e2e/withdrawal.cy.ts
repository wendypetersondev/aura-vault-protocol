// cypress/e2e/withdrawal.cy.ts

describe("Withdrawal Flow", () => {
  beforeEach(() => {
    cy.visit("/");
    cy.connectWallet();
    // Seed a share balance in the UI state via stub
    cy.intercept("GET", "**/balance_of*", { statusCode: 200, body: { balance: "200" } });
  });

  it("shows withdrawal form when wallet connected", () => {
    cy.get("[data-cy=withdraw-form]").should("be.visible");
  });

  it("disables submit when shares field is empty", () => {
    cy.get("[data-cy=withdraw-shares]").clear();
    cy.get("[data-cy=withdraw-submit]").should("be.disabled");
  });

  it("rejects withdrawal exceeding balance", () => {
    cy.get("[data-cy=withdraw-shares]").type("99999");
    cy.get("[data-cy=withdraw-submit]").click();
    cy.get("[data-cy=withdraw-error]").should("contain.text", "Insufficient");
  });

  it("submits valid withdrawal and shows pending state", () => {
    cy.intercept("POST", "**/transactions/submit*", { statusCode: 200, body: { result: "ok" } });
    cy.get("[data-cy=withdraw-shares]").type("50");
    cy.get("[data-cy=withdraw-submit]").click();
    cy.get("[data-cy=tx-pending]").should("be.visible");
  });

  it("shows updated balance after successful withdrawal", () => {
    cy.intercept("POST", "**/transactions/submit*", { statusCode: 200, body: { result: "ok" } });
    cy.intercept("GET", "**/balance_of*", { statusCode: 200, body: { balance: "150" } });
    cy.get("[data-cy=withdraw-shares]").type("50");
    cy.get("[data-cy=withdraw-submit]").click();
    cy.get("[data-cy=share-balance]", { timeout: 8000 }).should("contain", "150");
  });
});
