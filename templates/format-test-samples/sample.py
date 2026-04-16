# Intentionally malformed Python code to test Ruff formatter
# Press Shift+Alt+F to format this file
# Note: Ruff formatter only fixes style issues (indentation, spacing, quotes)
# It does NOT reorganize imports or fix import order

import os
import sys

# Bad indentation and spacing
def bad_function(x,y,z):
  result=x+y+z
  return result

# Inconsistent quotes and spacing
name='John'
message="Hello "+name
data={'key1':  'value1'  ,'key2':'value2'}

# Bad list/dict formatting
my_list=[1,2,3,4,5,6,7,8,9,10]
my_dict={'a':1,'b':2,'c':3,'d':4}

# Bad function call spacing
result=bad_function(1,2,3)
print(result)

# Bad class formatting
class MyClass:
 def __init__(self,name,age):
  self.name=name
  self.age=age
 def get_info(self):
    return f"{self.name} is {self.age} years old"

# Bad conditional formatting
if x>0:
 print('positive')
elif x<0:
    print('negative')
else:
  print('zero')

# Bad loop formatting
for i in range(10):
  if i%2==0:
   print(i)
