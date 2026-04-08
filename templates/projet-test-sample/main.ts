// Module principal qui utilise service.ts et utils.ts

import { MathService, processNumbers } from './service';
import { add, Calculator } from './utils';

function main() {
    // Utilisation directe de utils
    const sum = add(10, 20);
    console.log('Direct sum:', sum);

    // Utilisation du service
    const service = new MathService();
    console.log(service.performAddition(5, 15));
    console.log(service.performMultiplication(4, 7));

    // Utilisation du calculator via le service
    service.performCalculation(100, 50, 'add');
    service.performCalculation(10, 5, 'multiply');
    service.showHistory();

    // Utilisation de processNumbers
    const numbers = [1, 2, 3, 4, 5];
    const total = processNumbers(numbers);
    console.log('Total of array:', total);

    // Utilisation directe du Calculator
    const calc = new Calculator();
    calc.calculate(8, 2, 'multiply');
    calc.calculate(15, 5, 'add');
    console.log('Calculator history:', calc.getHistory());
}

main();
