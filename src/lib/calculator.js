function calculate(expression) {
  if (expression.length > 100 || !/^[\d\s.+\-*/%()]+$/.test(expression)) {
    throw new Error('استخدم الأرقام والعمليات + - * / % والأقواس فقط (حتى ١٠٠ حرف).');
  }
  let index = 0;
  const skipSpaces = () => { while (/\s/.test(expression[index] || '')) index++; };
  function expressionValue() {
    let value = term();
    while (true) {
      skipSpaces();
      const operator = expression[index];
      if (operator !== '+' && operator !== '-') return value;
      index++;
      const right = term();
      value = operator === '+' ? value + right : value - right;
    }
  }
  function term() {
    let value = factor();
    while (true) {
      skipSpaces();
      const operator = expression[index];
      if (!['*', '/', '%'].includes(operator)) return value;
      index++;
      const right = factor();
      if ((operator === '/' || operator === '%') && right === 0) throw new Error('لا يمكن القسمة على صفر.');
      value = operator === '*' ? value * right : operator === '/' ? value / right : value % right;
    }
  }
  function factor() {
    skipSpaces();
    if (expression[index] === '+' || expression[index] === '-') {
      const sign = expression[index++] === '-' ? -1 : 1;
      return sign * factor();
    }
    if (expression[index] === '(') {
      index++;
      const value = expressionValue();
      skipSpaces();
      if (expression[index++] !== ')') throw new Error('قوس غير مغلق.');
      return value;
    }
    const match = expression.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (!match) throw new Error('صيغة العملية غير مكتملة.');
    index += match[0].length;
    return Number(match[0]);
  }
  const result = expressionValue();
  skipSpaces();
  if (index !== expression.length || !Number.isFinite(result)) throw new Error('تعذر حساب العملية.');
  return result;
}

module.exports = { calculate };
