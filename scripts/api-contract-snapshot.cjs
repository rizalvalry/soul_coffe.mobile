const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const transports = new Set(['request', 'requestWithStatus', 'fetch', 'uploadFile', 'uploadFileWithStatus']);

function sourceFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(name) : /\.tsx?$/.test(entry.name) ? [name] : [];
  }).sort();
}

function keyOf(name) {
  return name && (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
    ? name.text : name && ts.isComputedPropertyName(name) && ts.isStringLiteral(name.expression)
      ? name.expression.text : null;
}

function property(object, key) {
  if (!object || !ts.isObjectLiteralExpression(object)) return null;
  return object.properties.find((item) => keyOf(item.name) === key) ?? null;
}

function valueOf(item) {
  if (item && ts.isPropertyAssignment(item)) return item.initializer;
  if (item && ts.isShorthandPropertyAssignment(item)) return item.name;
  return null;
}

function declaration(source, name, before) {
  let found = null;
  function visit(node) {
    if (node.pos >= before) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) {
      found = node.initializer;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}

function resolve(node, source, depth = 0) {
  if (!node || depth > 4) return node;
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) {
    return resolve(node.expression, source, depth + 1);
  }
  if (ts.isIdentifier(node)) {
    const next = declaration(source, node.text, node.pos);
    if (next && next !== node) return resolve(next, source, depth + 1);
  }
  if (ts.isCallExpression(node) && node.expression.getText(source) === 'JSON.stringify') {
    return resolve(node.arguments[0], source, depth + 1);
  }
  return node;
}

function functionReturn(node, source) {
  if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return null;
  const name = node.expression.text;
  let owner = source;
  let fn = owner.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === name);
  if (!fn) {
    const imported = source.statements.find((item) => ts.isImportDeclaration(item) &&
      item.importClause?.namedBindings && ts.isNamedImports(item.importClause.namedBindings) &&
      item.importClause.namedBindings.elements.some((part) => part.name.text === name));
    if (!imported || !ts.isStringLiteral(imported.moduleSpecifier)) return null;
    const specifier = imported.moduleSpecifier.text;
    const target = specifier.startsWith('@/') ? path.join(root, specifier.slice(2))
      : specifier.startsWith('.') ? path.resolve(path.dirname(source.fileName), specifier) : null;
    if (!target || !fs.existsSync(`${target}.ts`)) return null;
    owner = ts.createSourceFile(`${target}.ts`, fs.readFileSync(`${target}.ts`, 'utf8'),
      ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    fn = owner.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === name);
  }
  if (!fn) return null;
  const returned = fn.body?.statements.find((item) => ts.isReturnStatement(item) && item.expression);
  return returned ? { expression: returned.expression, source: owner } : null;
}

function parameterFields(node, source) {
  if (!ts.isIdentifier(node)) return null;
  let current = node.parent;
  while (current && !ts.isFunctionLike(current)) current = current.parent;
  const parameter = current?.parameters?.find((item) => ts.isIdentifier(item.name) && item.name.text === node.text);
  if (!parameter?.type) return null;
  let type = parameter.type;
  if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
    const alias = source.statements.find((item) => ts.isTypeAliasDeclaration(item) && item.name.text === type.typeName.text);
    if (!alias) return null;
    type = alias.type;
  }
  if (!ts.isTypeLiteralNode(type)) return null;
  return type.members.map((item) => keyOf(item.name)).filter(Boolean).sort();
}

function fieldsOf(node, source, depth = 0) {
  if (!node || depth > 5) return [];
  const fromParameter = parameterFields(node, source);
  if (fromParameter) return fromParameter;
  node = resolve(node, source);
  const returned = functionReturn(node, source);
  if (returned) return fieldsOf(returned.expression, returned.source, depth + 1);
  if (ts.isObjectLiteralExpression(node)) {
    const fields = [];
    for (const item of node.properties) {
      const key = keyOf(item.name);
      if (key) fields.push(key);
      if (ts.isSpreadAssignment(item)) {
        const spread = resolve(item.expression, source);
        if (ts.isObjectLiteralExpression(spread)) fields.push(...fieldsOf(spread, source, depth + 1));
        else if (ts.isConditionalExpression(spread)) {
          fields.push(...fieldsOf(spread.whenTrue, source, depth + 1));
          fields.push(...fieldsOf(spread.whenFalse, source, depth + 1));
        } else if (ts.isCallExpression(spread)) {
          fields.push(...fieldsOf(spread, source, depth + 1));
        } else fields.push(`...${item.expression.getText(source).replace(/\s+/g, ' ')}`);
      }
    }
    return [...new Set(fields)].sort();
  }
  if (ts.isConditionalExpression(node)) {
    return [...new Set([...fieldsOf(node.whenTrue, source, depth + 1), ...fieldsOf(node.whenFalse, source, depth + 1)])].sort();
  }
  return [node.getText(source).replace(/\s+/g, ' ')];
}

function pathOf(node, source) {
  if (!node) return '<missing>';
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return '`' + node.head.text + node.templateSpans.map((part) =>
      '${' + part.expression.getText(source).replace(/\s+/g, ' ') + '}' + part.literal.text).join('') + '`';
  }
  return node.getText(source).replace(/\s+/g, ' ');
}

function transportOf(expression, source) {
  if (ts.isPropertyAccessExpression(expression)) {
    return transports.has(expression.name.text) ? expression.name.text : null;
  }
  if (!ts.isIdentifier(expression)) return null;
  if (transports.has(expression.text)) return expression.text;
  for (const item of source.statements) {
    if (!ts.isImportDeclaration(item) || !ts.isStringLiteral(item.moduleSpecifier) ||
      item.moduleSpecifier.text !== '@/lib/api' ||
      !item.importClause?.namedBindings || !ts.isNamedImports(item.importClause.namedBindings)) continue;
    const alias = item.importClause.namedBindings.elements.find((part) => part.name.text === expression.text);
    const imported = alias?.propertyName?.text;
    if (imported && transports.has(imported)) return imported;
  }
  return null;
}

function callEntry(node, source, file) {
  const transport = transportOf(node.expression, source);
  if (!transport) return null;
  const upload = transport.startsWith('uploadFile');
  const directFetch = transport === 'fetch';
  const options = resolve(node.arguments[directFetch ? 1 : 1], source);
  const methodNode = valueOf(property(options, 'method'));
  const method = upload ? 'POST' : methodNode ? pathOf(methodNode, source) : 'GET';
  const bodyNode = directFetch ? valueOf(property(options, 'body')) : upload
    ? node.arguments[2] : valueOf(property(options, 'body'));
  const fieldName = upload ? node.arguments[3] ? pathOf(node.arguments[3], source) : 'file' : null;
  const bodyFields = fieldsOf(bodyNode, source);
  if (upload && bodyNode && ts.isIdentifier(bodyNode)) {
    // Multipart maps can gain optional fields after their object initializer.
    const beforeCall = source.text.slice(0, node.pos);
    const escaped = bodyNode.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const assigned = new RegExp(`\\b${escaped}\\[['\"]([^'\"]+)['\"]\\]\\s*=`, 'g');
    for (const match of beforeCall.matchAll(assigned)) bodyFields.push(match[1]);
  }
  if (upload) bodyFields.push(fieldName);
  const headerText = options ? options.getText(source) : '';
  const hasIdempotencyKey = upload ? Boolean(node.arguments[4]) : directFetch
    ? /Idempotency-Key|idempotencyKey/.test(headerText)
    : Boolean(property(options, 'idempotencyKey'));
  return {
    file: path.relative(root, file).replaceAll('\\', '/'),
    transport,
    method,
    path: pathOf(node.arguments[0], source),
    idempotencyKey: hasIdempotencyKey,
    bodyFields: [...new Set(bodyFields)].sort(),
  };
}

function transitionEntry(node, source, file) {
  if (!ts.isIdentifier(node.expression) || node.expression.text !== 'useTransition') return null;
  const pathBuilder = node.arguments[0];
  if (!pathBuilder || !ts.isArrowFunction(pathBuilder)) return null;
  const bodyBuilder = node.arguments[1];
  const body = bodyBuilder && ts.isArrowFunction(bodyBuilder) ? bodyBuilder.body : null;
  return {
    file: path.relative(root, file).replaceAll('\\', '/'),
    transport: 'request via useTransition', method: 'POST',
    path: pathOf(pathBuilder.body, source), idempotencyKey: true,
    bodyFields: fieldsOf(body, source),
  };
}

function subscriptionEntries(source, file) {
  const channels = [];
  const subscriptions = [];
  let channelSource = null;
  function whenOf(node) {
    let current = node.parent;
    while (current && !ts.isIfStatement(current)) current = current.parent;
    return current ? current.expression.getText(source).replace(/\s+/g, ' ') : null;
  }
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'names' &&
      node.initializer && ts.isCallExpression(node.initializer) &&
      node.initializer.expression.getText(source) === 'channelsFor') {
      channelSource = node.initializer.getText(source).replace(/\s+/g, ' ');
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'channels' &&
      node.initializer && ts.isArrayLiteralExpression(node.initializer)) {
      channels.push(...node.initializer.elements.map((item) => ({ channel: pathOf(item, source), when: null })));
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      if (node.expression.getText(source) === 'channels.push') {
        channels.push(...node.arguments.map((item) => ({ channel: pathOf(item, source), when: whenOf(node) })));
      }
      if (node.expression.name.text === 'listen' && node.arguments[0]) {
        const receiver = node.expression.expression;
        if (ts.isCallExpression(receiver) && ts.isPropertyAccessExpression(receiver.expression)) {
          const kind = receiver.expression.name.text;
          const target = receiver.arguments[0] ? pathOf(receiver.arguments[0], source) : '<missing>';
          const expanded = target === 'name' && channelSource
            ? channels : [{ channel: target, when: null }];
          for (const { channel, when } of expanded) subscriptions.push({
            file: path.relative(root, file).replaceAll('\\', '/'),
            kind, channel, event: pathOf(node.arguments[0], source), when,
            via: target === 'name' ? channelSource : null,
          });
        } else subscriptions.push({ file: path.relative(root, file).replaceAll('\\', '/'),
          kind: '<unknown>', channel: receiver.getText(source).replace(/\s+/g, ' '),
          event: pathOf(node.arguments[0], source), when: null, via: null });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return subscriptions;
}

function snapshot() {
  const calls = [];
  const subscriptions = [];
  for (const file of [...sourceFiles(path.join(root, 'src')), ...sourceFiles(path.join(root, 'app'))]) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    function visit(node) {
      if (ts.isCallExpression(node)) {
        const entry = callEntry(node, source, file);
        if (entry) calls.push(entry);
        const transition = transitionEntry(node, source, file);
        if (transition) calls.push(transition);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    subscriptions.push(...subscriptionEntries(source, file));
  }
  calls.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
  subscriptions.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
  return { calls, subscriptions };
}

if (require.main === module) process.stdout.write(`${JSON.stringify(snapshot(), null, 2)}\n`);
module.exports = { snapshot };
