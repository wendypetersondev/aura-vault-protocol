// cypress/support/commands.ts

declare global {
  namespace Cypress {
    interface Chainable {
      connectWallet(): Chainable<void>;
      disconnectWallet(): Chainable<void>;
    }
  }
}

/** Stub window.freighter (Stellar wallet) and trigger a connect flow. */
Cypress.Commands.add("connectWallet", () => {
  cy.window().then((win) => {
    // Inject a minimal Freighter stub
    (win as any).freighterApi = {
      isConnected: cy.stub().resolves(true),
      getPublicKey: cy.stub().resolves("GABC1234TESTPUBLICKEY"),
      getNetwork: cy.stub().resolves("TESTNET"),
      signTransaction: cy.stub().resolves("signed_xdr"),
    };
  });
  cy.get("[data-cy=connect-wallet-btn]").click();
  cy.get("[data-cy=wallet-address]", { timeout: 8000 }).should("be.visible");
});

Cypress.Commands.add("disconnectWallet", () => {
  cy.get("[data-cy=disconnect-wallet-btn]").click();
  cy.get("[data-cy=connect-wallet-btn]").should("be.visible");
});

export {};
