// Intentionally poorly formatted C++ code
#include <iostream>
#include <vector>

class MyClass{
private:
int x;
int y;
public:
MyClass(int a,int b):x(a),y(b){}
void print(){
std::cout<<"x: "<<x<<", y: "<<y<<std::endl;
}
};

int main(   ){
std::vector<int> vec={1,2,3,4,5};

for(auto i:vec){
std::cout<<i<<" ";
}
std::cout<<std::endl;

    MyClass obj(10,20);
obj.print();

if(vec.size()>0){
std::cout<<"Vector is not empty"<<std::endl;
}else{
std::cout<<"Vector is empty"<<std::endl;}

    return 0;
}
