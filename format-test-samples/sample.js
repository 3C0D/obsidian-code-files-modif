// JavaScript sample with formatting issues
function calculateTotal(items,tax){
const subtotal=items.reduce((sum,item)=>{
return sum+item.price*item.quantity;},0);
return subtotal*(1+tax);}

const products=[{name:"Laptop",price:999,quantity:1},{name:"Mouse",price:25,quantity:2}];

const result=calculateTotal(products,0.2);
console.log(`Total: $${result.toFixed(2)}`);

class ShoppingCart{constructor(){this.items=[];}
addItem(item){this.items.push(item);}
getTotal(){return this.items.reduce((sum,item)=>sum+item.price,0);}}
