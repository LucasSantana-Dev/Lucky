# Waste Patterns to Delete

Within each file, delete `it()` blocks matching these patterns.

## Mocked-everything units (largest source of bloat)

The file under test is mocked inside its own spec — nothing real runs:

```ts
jest.mock('../myService') // myService is what this file is supposed to test
```

Delete every test in that describe block. If the whole file is this pattern, delete the file.

Only assertion is that a mock was called with its own mock input:

```ts
expect(mockSendEmail).toHaveBeenCalledWith(mockPayload)
// where mockPayload is defined in the same test
```

This is circular. Delete.

## Filler assertions

```ts
expect(result).toBeDefined()
expect(result).not.toBeNull()
expect(true).toBe(true)
expect(service).toBeInstanceOf(MyService)
expect(typeof handler).toBe('function')
```

## Trivial structure tests

```ts
it('should be defined', () => {
    expect(service).toBeDefined()
})
it('should create an instance', () => {
    expect(new MyClass()).toBeInstanceOf(MyClass)
})
it('should return the id', () => {
    expect(obj.getId()).toBe(obj.id)
})
```

## Redundant same-path tests

3+ tests exercise the identical code path with cosmetically different inputs. Keep 1:

```ts
it('formats Alice', () => expect(format('Alice')).toBe('Alice'))
it('formats Bob', () => expect(format('Bob')).toBe('Bob'))
it('formats Carol', () => expect(format('Carol')).toBe('Carol'))
```

→ Keep 1.

## Snapshot bloat

`toMatchSnapshot()` on pure data transformations or serialized plain objects where the snapshot is just a stringified version of the input. Delete unless the rendered output is itself the contract (CLI help text, email templates, PDF output).

## Slow test smell

```bash
grep -rn "sleep\|setTimeout\|setInterval\|waitFor.*\d{4,}" \
  --include="*.spec.*" --include="*.test.*" . | grep -v node_modules
```

Tests with multi-second waits are usually testing timing rather than behavior. Delete the timing-dependent tests; fix the source code if it has a hardcoded delay.
