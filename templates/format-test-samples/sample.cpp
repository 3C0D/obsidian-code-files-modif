// Intentionally malformed C++ code to test clang-format
// Press Shift+Alt+F to format this file

#include <iostream>
#include <vector>
#include <string>

// Bad class formatting
class MyClass{
private:
int value;
std::string name;
public:
MyClass(int v,std::string n):value(v),name(n){}
int getValue(){return value;}
void setValue(int v){value=v;}
};

// Bad namespace and function formatting
namespace MyNamespace{
void helperFunction(int a,int b){
std::cout<<"Sum: "<<(a+b)<<std::endl;
}
}

// Bad template formatting
template<typename T>
T max(T a,T b){
return(a>b)?a:b;
}

int main(){
// Bad spacing and indentation
std::vector<int>numbers={1,2,3,4,5};
for(auto n:numbers){
std::cout<<n<<" ";
}
std::cout<<std::endl;

// Bad pointer/reference formatting
int*ptr=new int(42);
int&ref=*ptr;

MyClass obj(10,"test");
std::cout<<"Value: "<<obj.getValue()<<std::endl;

delete ptr;
return 0;
}
