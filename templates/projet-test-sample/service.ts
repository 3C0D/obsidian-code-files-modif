// Module service qui utilise les fonctions de utils.ts

import { add, multiply, formatMessage, Calculator } from './utils';

export class MathService {
    private calculator: Calculator;

    constructor() {
        this.calculator = new Calculator();
    }

    performAddition(x: number, y: number): string {
        const result = add(x, y);
        return formatMessage('Addition', result);
    }

    performMultiplication(x: number, y: number): string {
        const result = multiply(x, y);
        return formatMessage('Multiplication', result);
    }

    performCalculation(a: number, b: number, op: 'add' | 'multiply'): number {
        return this.calculator.calculate(a, b, op);
    }

    showHistory(): void {
        const history = this.calculator.getHistory();
        console.log('Calculation history:', history);
    }
}

export function processNumbers(nums: number[]): number {
    let total = 0;
    for (const num of nums) {
        total = add(total, num);
    }
    return total;
}
