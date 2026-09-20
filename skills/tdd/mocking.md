# When to Mock

Mock at **system boundaries** only:

- External APIs (payment, email, etc.)
- Databases (sometimes - prefer test DB)
- Time/randomness
- File system (sometimes)

Don't mock:

- Your own classes/modules
- Internal collaborators
- Anything you control

## Keep the behavior under test real

Choose the test-double boundary from the acceptance criterion, not merely from which dependency is inconvenient to run. Keep the mechanism that could cause the named violation in the exercised path; substitute the external environment beyond that mechanism.

- To verify rollback after a model failure, a controlled model adapter can provide the failure.
- To verify that the real adapter makes no additional HTTP attempts, keep the adapter and SDK real and substitute the HTTP transport or endpoint.
- To verify a generated file, read the actual temporary file instead of replacing the write and asserting what was passed to it.
- To verify behavior under concurrency, control scheduling with explicit synchronization rather than relying on arbitrary sleeps.

The approved seam remains the entry point. Moving a test double below an SDK does not require exposing another application interface. A test double supplies conditions and observations; it does not supply the behavior the test claims to verify.

## Designing for Mockability

At system boundaries, design interfaces that are easy to mock:

**1. Use dependency injection**

Pass external dependencies in rather than creating them internally:

```typescript
// Easy to mock
function processPayment(order, paymentClient) {
  return paymentClient.charge(order.total);
}

// Hard to mock
function processPayment(order) {
  const client = new StripeClient(process.env.STRIPE_KEY);
  return client.charge(order.total);
}
```

**2. Prefer SDK-style interfaces over generic fetchers**

Create specific functions for each external operation instead of one generic function with conditional logic:

```typescript
// GOOD: Each function is independently mockable
const api = {
  getUser: (id) => fetch(`/users/${id}`),
  getOrders: (userId) => fetch(`/users/${userId}/orders`),
  createOrder: (data) => fetch('/orders', { method: 'POST', body: data }),
};

// BAD: Mocking requires conditional logic inside the mock
const api = {
  fetch: (endpoint, options) => fetch(endpoint, options),
};
```

The SDK approach means:
- Each mock returns one specific shape
- Explicit, deterministic responses or response sequences for the conditions the scenario needs; do not recreate the production algorithm inside the double
- Easier to see which endpoints a test exercises
- Type safety per endpoint
