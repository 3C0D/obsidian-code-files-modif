// TypeScript sample with formatting issues
interface User{id:number;name:string;email:string;}

type Product={id:number;name:string;price:number;};

function processUser(user:User):string{return `User: ${user.name} (${user.email})`;}

const users:User[]=[{id:1,name:"Alice",email:"alice@example.com"},{id:2,name:"Bob",email:"bob@example.com"}];

class DataService<T>{private items:T[]=[];
add(item:T):void{this.items.push(item);}
getAll():T[]{return this.items;}
findById(id:number):T|undefined{return this.items.find((item:any)=>item.id===id);}}
