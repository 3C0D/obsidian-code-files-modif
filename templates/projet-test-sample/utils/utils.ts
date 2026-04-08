// Module utilitaire avec des fonctions réutilisables

export function add(a: number, b: number): number {
    return a + b;
}

export function multiply(a: number, b: number): number {
    return a * b;
}

export function formatMessage(name: string, value: number): string {
    return `Hello ${name}, your value is ${value}`;
}

export class Calculator {
    private history: number[] = [];

    calculate(a: number, b: number, operation: 'add' | 'multiply'): number {
        const result = operation === 'add' ? add(a, b) : multiply(a, b);
        this.history.push(result);
        return result;
    }

    getHistory(): number[] {
        return this.history;
    }
}
