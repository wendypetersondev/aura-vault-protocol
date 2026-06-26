// cypress/e2e/deposit.cy.ts

describe("Deposit Flow", () => {
  beforeEach(() => {
    cy.visit("/");
    cy.connectWallet();
  });

  it("shows deposit form when wallet connected", () => {
    cy.get("[data-cy=deposit-form]").should("be.visible");
  });

  it("disables submit when amount is empty", () => {
    cy.get("[data-cy=deposit-amount]").clear();
    cy.get("[data-cy=deposit-submit]").should("be.disabled");
  });

  it("rejects zero deposit", () => {
    cy.get("[data-cy=deposit-amount]").type("0");
    cy.get("[data-cy=deposit-submit]").click();
    cy.get("[data-cy=deposit-error]").should("contain.text", "greater than 0");
  });

  it("submits a valid deposit and shows pending state", () => {
    cy.intercept("POST", "**/transactions/submit*", { statusCode: 200, body: { result: "ok" } });
    cy.get("[data-cy=deposit-amount]").type("100");
    cy.get("[data-cy=deposit-submit]").click();
    cy.get("[data-cy=tx-pending]").should("be.visible");
  });

  it("displays updated share balance after deposit", () => {
    cy.intercept("POST", "**/transactions/submit*", { statusCode: 200, body: { result: "ok" } });
    cy.intercept("GET", "**/balance_of*", { statusCode: 200, body: { balance: "100" } });
    cy.get("[data-cy=deposit-amount]").type("100");
    cy.get("[data-cy=deposit-submit]").click();
    cy.get("[data-cy=share-balance]", { timeout: 8000 }).should("not.contain", "0");
  });
});
