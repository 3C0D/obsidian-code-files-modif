// Intentionally poorly formatted C code to test Monaco's built-in formatter
#include <stdio.h>
#include <stdlib.h>

int main(   ){
int x=5;
int y    =    10;
    int z=x+y;

if(x>0){
printf("x is positive\n");
}else{
printf("x is not positive\n");}

    for(int i=0;i<5;i++){
printf("i = %d\n",i);
    }

while(y>0)
{
y--;
        printf("y = %d\n",y);
}

    return 0;
}

void helper_function(int a,int b,int c)
{
int result=a+b+c;
    printf("Result: %d\n",result);
}
