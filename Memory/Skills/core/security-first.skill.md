---
id: "550e8400-e29b-41d4-a716-446655440002"
created_at: "2026-01-05T00:00:00.000Z"
source: "user"
scope: "global"
status: "active"
skill_id: "security-first"
name: "Security-First Development"
version: "1.0.0"
description: "Ensures security considerations are integrated throughout development"

triggers:
  keywords:
    - security
    - authentication
    - authorization
    - auth
    - password
    - token
    - encryption
    - decrypt
    - sensitive
    - credentials
    - secret
    - api-key
    - jwt
    - session
    - permission
    - access
  task_types:
    - security
    - security-review
    - audit
    - authentication
  file_patterns:
    - "**/auth/**"
    - "**/security/**"
    - "**/login/**"
    - "**/session/**"
    - "**/*auth*.ts"
    - "**/*security*.ts"
  tags:
    - security
    - authentication
    - authorization

constraints:
  - "Never log sensitive data (passwords, tokens, keys)"
  - "Always validate and sanitize user input"
  - "Use parameterized queries for database operations"
  - "Never store secrets in code or version control"
  - "Implement proper error handling without leaking information"

output_requirements:
  - "Security considerations documented"
  - "No hardcoded secrets or credentials"
  - "Input validation present for all user inputs"

quality_criteria:
  - name: "OWASP Compliance"
    description: "Code addresses relevant OWASP Top 10 concerns"
    weight: 40
  - name: "Input Validation"
    description: "All inputs are validated and sanitized"
    weight: 30
  - name: "Secret Management"
    description: "Secrets are properly managed"
    weight: 30

compatible_with:
  agents:
    - "*"

usage_count: 0
---

# Security-First Development

Apply security best practices throughout development:

## 1. Input Validation

**Always validate and sanitize all user input:**

```typescript
// ✅ Good: Validate input with schema
const userInput = UserInputSchema.parse(request.body);

// ❌ Bad: Trust user input directly
const { email, password } = request.body;
```

**Rules:**
- Validate data type, length, format, and range
- Use allowlists over denylists
- Sanitize for the output context (HTML, SQL, etc.)

## 2. Authentication & Authorization

**Implement proper access control:**

```typescript
// ✅ Good: Check permissions explicitly
if (!user.hasPermission('admin:delete')) {
  throw new ForbiddenError('Insufficient permissions');
}

// ❌ Bad: Security through obscurity
// Hoping users won't guess the admin URL
```

**Rules:**
- Verify authentication on every protected route
- Use role-based or attribute-based access control
- Fail securely (deny by default)

## 3. Secret Management

**Never hardcode secrets:**

```typescript
// ✅ Good: Use environment variables
const apiKey = Deno.env.get("API_KEY");

// ❌ Bad: Hardcoded secrets
const apiKey = "sk-1234567890abcdef";
```

**Rules:**
- Use environment variables or secret managers
- Rotate secrets regularly
- Never commit secrets to version control

## 4. Secure Data Handling

**Protect sensitive data:**

```typescript
// ✅ Good: Hash passwords properly
const hash = await bcrypt.hash(password, 10);

// ❌ Bad: Store plain text or weak hash
const hash = md5(password);
```

**Rules:**
- Use strong encryption for sensitive data at rest
- Use TLS for data in transit
- Minimize data collection and retention

## 5. Error Handling

**Don't leak information through errors:**

```typescript
// ✅ Good: Generic error message
throw new Error("Authentication failed");

// ❌ Bad: Information leakage
throw new Error(`User ${email} not found in database`);
```

**Rules:**
- Log detailed errors server-side
- Return generic errors to clients
- Never expose stack traces in production

## 6. OWASP Top 10 Checklist

Always consider:
- [ ] **Injection** - Parameterized queries, input validation
- [ ] **Broken Authentication** - Strong passwords, MFA, session management
- [ ] **Sensitive Data Exposure** - Encryption, proper storage
- [ ] **XML External Entities** - Disable external entities
- [ ] **Broken Access Control** - Verify permissions
- [ ] **Security Misconfiguration** - Secure defaults
- [ ] **Cross-Site Scripting (XSS)** - Output encoding
- [ ] **Insecure Deserialization** - Validate serialized data
- [ ] **Components with Vulnerabilities** - Update dependencies
- [ ] **Insufficient Logging** - Audit trails
