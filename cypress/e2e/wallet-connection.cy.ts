// cypress/e2e/wallet-connection.cy.ts

describe("Wallet Connection", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("shows connect button when wallet is not connected", () => {
    cy.get("[data-cy=connect-wallet-btn]").should("be.visible");
    cy.get("[data-cy=wallet-address]").should("not.exist");
  });

  it("connects wallet and displays truncated address", () => {
    cy.connectWallet();
    cy.get("[data-cy=wallet-address]").should("contain", "GABC");
  });

  it("disconnects wallet and returns to initial state", () => {
    cy.connectWallet();
    cy.disconnectWallet();
    cy.get("[data-cy=connect-wallet-btn]").should("be.visible");
  });

  it("shows network badge after connecting", () => {
    cy.connectWallet();
    cy.get("[data-cy=network-badge]").should("contain.text", "TESTNET");
  });
});
