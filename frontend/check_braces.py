
import sys
import os

def check_braces(filename):
    if not os.path.exists(filename):
        print(f"Error: File {filename} not found.")
        return False
        
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"Error reading file: {e}")
        return False
    
    stack = []
    pairs = {'(': ')', '{': '}', '[': ']'}
    lines = content.split('\n')
    
    for i, line in enumerate(lines):
        for j, char in enumerate(line):
            if char in pairs.keys():
                stack.append((char, i + 1, j + 1))
            elif char in pairs.values():
                if not stack:
                    print(f"Unexpected closing {char} at line {i+1}, col {j+1}")
                    return False
                top, line_num, col_num = stack.pop()
                if pairs[top] != char:
                    print(f"Mismatched {char} at line {i+1}, col {j+1} (opened {top} at line {line_num}, col {col_num})")
                    return False
    
    if stack:
        for char, line_num, col_num in stack:
            print(f"Unclosed {char} opened at line {line_num}, col {col_num}")
        return False
    
    print("All braces are balanced.")
    return True

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python check_braces.py <filename>")
    else:
        check_braces(sys.argv[1])
