// Intentionally malformed C code to test clang-format
// Press Shift+Alt+F to format this file

#include <stdio.h>
#include <stdlib.h>

// Bad indentation and spacing
int main(int argc,char** argv){
int x=5;
int y    =    10;
    int z=x+y;

// Inconsistent brace style
if(x>0)
{
printf("x is positive\n");
}
else{
    printf("x is not positive\n");
        }

// Bad function formatting
void helper(int a,int b,int c){
return a+b+c;
}

// Array with bad spacing
int arr[]={1,2,3,4,5};
for(int i=0;i<5;i++){
printf("%d ",arr[i]);
}

return 0;
}
