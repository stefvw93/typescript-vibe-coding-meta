# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

This is a Deno TypeScript project - a modern JavaScript/TypeScript runtime
alternative to Node.js. Deno executes TypeScript directly without requiring a
build step.

## Key Commands

### Development

- `deno task dev` - Run the main application with file watching for auto-reload
- `deno run main.ts` - Run the main application once

### Testing

- `deno test` - Run all tests in the project
- `deno test main_test.ts` - Run tests for a specific file
- `deno test --watch` - Run tests with file watching

### Code Quality

- `deno fmt` - Format all TypeScript files according to Deno's default style
- `deno lint` - Lint all TypeScript files for common issues
- `deno check main.ts` - Type-check without running the code

## Architecture

The project follows Deno's module-based architecture:

- **Module Exports**: Functions are exported directly from `.ts` files
- **Testing Pattern**: Test files use `_test.ts` suffix and import the module
  being tested
- **Entry Point**: `main.ts` uses `import.meta.main` to determine if it's being
  run directly vs imported
- **Dependencies**: Managed through JSR imports in `deno.json` (not npm
  packages)

## Deno-Specific Considerations

1. **No node_modules**: Dependencies are cached globally, not in the project
   directory
2. **Direct TypeScript execution**: No compilation step or dist/ folder
3. **Import syntax**: Use explicit file extensions (`.ts`) in imports
4. **Standard library**: Import from `jsr:@std/` for Deno standard library
   modules
5. **Permissions**: Deno requires explicit permissions for file system, network,
   and environment access

## Code Validation Rules

### Automated Validation Sequence

After every code change, automatically execute the following validation
pipeline:

1. `deno fmt` - Format the code
2. `deno check` - Perform type checking
3. `deno test` - Run tests (two-stage approach)
4. `deno lint` - Check for linting issues

### Two-Stage Testing Approach

1. **Isolated Testing**: First validate the specific feature or file being
   worked on
2. **Full Suite Validation**: Once isolated tests pass, run the complete test
   suite

### Error Resolution

- Silently fix all validation failures through iterative attempts
- Continue fixing and re-running validation until all checks pass
- Only report errors if unable to resolve after multiple attempts

### Test Coverage Requirements

- Immediately create corresponding test files for any new functionality
- Ensure all new code has appropriate test coverage
- Follow Deno convention: use `_test.ts` suffix for test files

### Dependency Management

Before adding any external dependency:

1. Check if similar functionality already exists in the codebase
2. Prefer Deno's standard library (`jsr:@std/`) over third-party packages
3. Ask for approval before adding new dependencies to `deno.json`

## Git Workflow and Discipline

### Branch Management

- **Automatic Branch Creation**: Create new branches for every feature, fix, or
  change
- **Branch Source**: Always branch from `main` unless explicitly instructed
  otherwise
- **Naming Convention**:
  - `feature/*` - New features or enhancements
  - `fix/*` - Bug fixes
  - `chore/*` - Maintenance tasks, refactoring, documentation
- **Post-Completion**: Always return to `main` branch after completing work

### Commit Practices

- **Automatic Commits**: Commit automatically after validation passes for
  significant changes
- **Commit Format**: Use Conventional Commits specification:
  - `feat:` - New features
  - `fix:` - Bug fixes
  - `chore:` - Maintenance and refactoring
  - `docs:` - Documentation changes
  - `test:` - Test additions or modifications
- **Issue References**: Include issue or ticket numbers when known (e.g.,
  `fix: resolve login bug (#123)`)
- **History Management**: Squash related commits before pushing to maintain
  clean history

### Pull Request Process

1. Push changes to remote branch
2. Wait for explicit approval before creating pull requests
3. Include detailed descriptions in PRs:
   - Summary of changes
   - Testing performed
   - Any breaking changes or migration requirements
   - Related issues or tickets

### Conflict Resolution

- Never attempt to resolve merge conflicts automatically
- Always ask for guidance when conflicts are encountered
- Provide clear information about the conflicting changes

## Feature Specification Rules

### Specification Requirements

- **Mandatory Specs**: Every feature must have a `specs.md` file
- **Location**: Place specs.md in the same directory as the main feature module
  (colocated)
- **Single Source**: Use one specs.md at the feature root for complex features
  with multiple components

### Specification Content

Every specs.md file must contain:

1. **Feature Overview**: Clear description of what the feature does
2. **Purpose**: Why this feature exists and what problem it solves
3. **Acceptance Criteria/Requirements**: Specific, testable requirements

Additional sections as needed:

- Technical requirements and constraints
- API specifications and interfaces
- Test scenarios
- Implementation notes

### Specification Workflow

1. **Spec-First Development**:
   - Conduct extensive Q&A discussion before any implementation
   - Create comprehensive specs through interactive discussion
   - Never start coding without approved specifications

2. **Missing Specifications**:
   - Always validate that specs.md exists for features
   - If missing, stop and ask if it should be created
   - If yes, initiate Q&A feature discussion to create specs

3. **Specification Updates**:
   - Update specs.md when modifying existing features
   - Create separate commits for spec updates
   - Use `docs:` commit prefix for specification changes
   - Specs may be updated during or after coding sessions as needed

### Feature Discussion Process

- Always use Q&A style for new feature discussions
- Ask focused questions and wait for responses
- Build comprehensive understanding before creating specs
- Ensure alignment between human intent and implementation plan

### Specification Validation

- Check for specs.md existence before working on any feature
- Note: Tests should verify that implementation aligns with specifications
  (testing rules to be defined separately)

## TypeScript Mock-First Development

### Development Sequence

After specs are approved, follow this strict sequence:

1. **Create TypeScript Mocks**: Use `declare` keyword to mock the entire API
   surface
2. **Write All Tests**: Create comprehensive test suite based on mocked API
3. **Implement Features**: Replace mocks with actual implementation using TDD
4. **Validate Continuously**: Run full validation pipeline after each change

### Mock Creation Rules

- **Scope**: Mock both public APIs and internal interfaces
- **Location**: Place mocks in the actual implementation files (will be replaced
  during implementation)
- **Type Signatures**: Use complete, production-ready type signatures from the
  start
- **Validation**: Run `deno check` to ensure valid TypeScript declarations
- **Alignment**: Mocks must align with specs.md requirements
- **Additions**: Include useful helper functions and abstractions as needed

### Mock Documentation

- **JSDoc Required**: Include JSDoc comments with descriptions (no type
  annotations)
- **No Type Annotations**: TypeScript provides types, don't duplicate in JSDoc
- **Spec References**: Include links to relevant specs.md sections where
  applicable
- **Purpose**: Document intended behavior and usage

### Mock Examples

```typescript
/**
 * Calculates the total price including tax
 * See specs.md#pricing-calculation for requirements
 */
declare function calculateTotal(items: Item[], taxRate: number): number;

/**
 * Repository for user data management
 */
declare class UserRepository {
  /**
   * Finds a user by their unique identifier
   */
  findById(id: string): Promise<User | null>;

  /**
   * Creates a new user in the system
   */
  create(userData: CreateUserDto): Promise<User>;
}
```

### Modification Process

If API changes are needed during development:

1. Get explicit approval for specification updates
2. Update specs.md with approved changes
3. Update TypeScript mocks to reflect new specs
4. Update tests to match new mocked API
5. Implement the modified functionality

### Benefits of Mock-First Approach

- Forces complete API design before implementation
- Enables parallel test development
- Catches type issues early
- Provides clear implementation target
- Documents intended interfaces

## Comprehensive Testing Rules

### Test Framework and Structure

- **Framework**: Use Deno's built-in test framework exclusively
- **Organization**: Group related tests with descriptive names
- **Naming**: Use behavior descriptions (e.g., "calculates total with tax")
- **File Naming**: Follow Deno convention with `_test.ts` suffix

### Coverage Requirements

- **Target**: 100% code coverage for all new features (unless explicitly
  instructed otherwise)
- **Scope**: Test all public APIs and internal functions
- **Edge Cases**: Include boundary values, error conditions, and special cases

### Test Implementation Guidelines

#### What to Test

- Test behavior based on type signatures
- Test runtime throwing conditions not visible in function signatures
- Test Promise rejections and error handling
- DO NOT test what TypeScript compiler already catches

#### What NOT to Test

- Type errors that the compiler will catch
- Invalid type inputs that TypeScript prevents
- Implementation details not part of the public API

### Test Data Management

- **Default**: Inline test data directly in tests for clarity
- **Complex Fixtures**: Use `test-data/` directory for large or reusable
  fixtures
- **Test Isolation**: Each test should set up its own data

### Test Documentation

- **Specs References**: Include links to relevant specs.md sections
- **Self-Documenting**: Tests should be readable without comments
- **Complex Scenarios**: Add explanatory comments only when necessary
- **Test Output**: Capture and display console output for debugging

### Async Testing Best Practices

- Always use async/await for asynchronous operations
- Test both success and rejection cases for Promises
- Set appropriate timeouts for long-running operations
- Ensure proper cleanup of async resources

### Test Example

```typescript
// user_repository_test.ts
import { assertEquals, assertRejects } from "jsr:@std/assert";
import { UserRepository } from "./user_repository.ts";

Deno.test("UserRepository.findById returns user when exists", async () => {
  // See specs.md#user-retrieval for requirements
  const repo = new UserRepository();
  const user = await repo.findById("123");

  assertEquals(user?.id, "123");
  assertEquals(user?.name, "Test User");
});

Deno.test("UserRepository.findById returns null when user not found", async () => {
  const repo = new UserRepository();
  const user = await repo.findById("nonexistent");

  assertEquals(user, null);
});

Deno.test("UserRepository.create throws when user data invalid", async () => {
  const repo = new UserRepository();

  await assertRejects(
    async () => await repo.create({ name: "" }),
    Error,
    "Name cannot be empty",
  );
});
```

### Mocking Guidelines

- Ask for approval before adding any mocking utilities
- Prefer real implementations when feasible
- Create manual stubs/mocks when necessary
- Document why mocking is needed

### Test Execution

- Tests run as part of the validation pipeline
- Two-stage approach: isolated tests first, then full suite
- Continue fixing until all tests pass
- Capture and display test output for debugging

## Meta Rules

- Always discuss new rules and rule changes in Q&A style
