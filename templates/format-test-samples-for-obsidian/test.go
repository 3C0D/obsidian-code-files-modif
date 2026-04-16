package main

import (
"fmt"
	"strings"
)

func main() {
x:=5
	y := 10
z:=x+y

	if x>5{
fmt.Println("x is greater than 5")
}else {
		fmt.Println("x is not greater")
	}

for i:=0;i<10;i++{
fmt.Println(i)
	}

	result:=add(x,y)
fmt.Println(result)
}

func add(a,b int)int{
return a+b
}
