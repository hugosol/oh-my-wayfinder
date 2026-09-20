# When to Mock

## Keep the behavior under test real

Choose the test-double boundary from the acceptance criterion, not merely from which dependency is inconvenient to run.

Keep the mechanism that could cause the named violation in the exercised path. Substitute the external environment beyond that mechanism.

For example:

- To verify rollback after a model failure, a controlled model adapter can provide the failure.
- To verify that the real adapter makes no additional HTTP attempts, keep the adapter and SDK real and substitute the HTTP transport or endpoint.
- To verify a generated file, read the actual temporary file instead of replacing the write and asserting what was passed to it.
- To verify behavior under concurrency, control scheduling with explicit synchronization rather than relying on arbitrary sleeps.

The approved seam remains the entry point. Moving a test double below an SDK does not require exposing another application interface.

A test double supplies conditions and observations; it does not supply the behavior the test claims to verify.

## System boundaries

Mock at **system boundaries** only:

- External APIs (payment, email, etc.)
- Databases (sometimes — prefer a test database)
- Time/randomness
- File system (sometimes — prefer a temporary real file system)

Don't mock:

- Your own classes/modules
- Internal collaborators
- Anything you control

## Designing for mockability

### 1. Use dependency injection

Pass external dependencies in rather than creating them internally:

```typescript
// Easy to control at the external boundary
function processPayment(order, paymentClient) {
  return paymentClient.charge(order.total);
}

// Hard to control without replacing owned implementation
function processPayment(order) {
  const client = new StripeClient(process.env.STRIPE_KEY);
  return client.charge(order.total);
}
```

### 2. Prefer SDK-style interfaces over generic fetchers

Create specific functions for each external operation instead of one generic function with conditional logic:

```typescript
// GOOD: Each function represents one external operation
const api = {
  getUser: (id) => fetch(`/users/${id}`),
  getOrders: (userId) => fetch(`/users/${userId}/orders`),
  createOrder: (data) => fetch('/orders', { method: 'POST', body: data }),
};

// BAD: Production behavior is hidden behind one generic conditional interface
const api = {
  fetch: (endpoint, options) => fetch(endpoint, options),
};
```

Specific external operations make it easier to see which interaction a scenario exercises and which response shape it receives.

Prefer explicit, deterministic responses or response sequences. Keep test-double behavior limited to the external conditions the scenario needs; do not recreate the production algorithm inside the double.
