import { User, createUser } from '@models/user';
import { formatName } from '@utils/format';

const user: User = createUser(formatName('  Alice  '), 'alice@example.com');
console.log(user);
