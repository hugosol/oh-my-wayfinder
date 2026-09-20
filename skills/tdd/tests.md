# Good and Bad Tests

## Good Tests

**Integration-style**: Test through real interfaces, not mocks of internal parts.

```typescript
// GOOD: Tests observable behavior
test("user can checkout with valid cart", async () => {
  const cart = createCart();
  cart.add(product);
  const result = await checkout(cart, paymentMethod);
  expect(result.status).toBe("confirmed");
});
```

Characteristics:

- Tests behavior users/callers care about
- Uses public API only
- Survives internal refactors
- Describes WHAT, not HOW
- Tests one coherent behavior, with enough assertions to establish it

## Preserve the acceptance criterion

A coverage ID or test name establishes traceability, not proof. The scenario and assertions must preserve the criterion's condition, scope, and outcome.

Choose a scenario in which the named violation could occur:

- Repeated-processing guarantees require the relevant sequence of operations and state transitions, not just one invocation with a hand-built end state.
- Concurrency limits require controlled overlapping work; a single request cannot distinguish bounded from unbounded concurrency.
- Retry limits require an eligible failure and observation of attempts at the boundary the criterion constrains.
- Final-artifact guarantees require reading the delivered artifact rather than only checking an intermediate object.

An independent literal is not enough if it describes a weaker or different behavior. Check both the source of the expected value and the meaning of the assertion.

A qualitative evaluation uses agreed criteria established before judging the output. Record mixed results as mixed results unless those criteria justify acceptance.

## Bad Tests

**Implementation-detail tests**: Coupled to internal structure.

```typescript
// BAD: Tests implementation details
test("checkout calls paymentService.process", async () => {
  const mockPayment = jest.mock(paymentService);
  await checkout(cart, payment);
  expect(mockPayment.process).toHaveBeenCalledWith(cart.total);
});
```

Red flags:

- Mocking internal collaborators
- Testing private methods
- Asserting internal call counts or order instead of observable behavior
- Test breaks when refactoring without behavior change
- Test name describes HOW not WHAT
- Verifying through external means instead of interface

External interaction counts or ordering are valid assertions when the acceptance criterion explicitly constrains them. Observe the actual constrained interaction: one wrapper invocation does not necessarily mean one external request.

```typescript
// BAD: Bypasses interface to verify
test("createUser saves to database", async () => {
  await createUser({ name: "Alice" });
  const row = await db.query("SELECT * FROM users WHERE name = ?", ["Alice"]);
  expect(row).toBeDefined();
});

// GOOD: Verifies through interface
test("createUser makes user retrievable", async () => {
  const user = await createUser({ name: "Alice" });
  const retrieved = await getUser(user.id);
  expect(retrieved.name).toBe("Alice");
});
```

**Tautological tests**: Expected value restates the implementation, so the test passes by construction.

```typescript
// BAD: Expected value is recomputed the way the code computes it
test("calculateTotal sums line items", () => {
  const items = [{ price: 10 }, { price: 5 }];
  const expected = items.reduce((sum, i) => sum + i.price, 0);
  expect(calculateTotal(items)).toBe(expected);
});

// GOOD: Expected value is an independent, known literal
test("calculateTotal sums line items", () => {
  expect(calculateTotal([{ price: 10 }, { price: 5 }])).toBe(15);
});
```
