#!/usr/bin/env python3
import os
import zipfile

def zip_extension():
    # The script is located in "Gemini Mass Delete Extension/dev"
    # The source directory is the parent directory of this script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    source_dir = os.path.dirname(script_dir)
    
    # Generate the zip file inside the dev directory
    output_filename = os.path.join(script_dir, "Gemini_Mass_Delete_Extension.zip")
    
    if not os.path.exists(source_dir):
        print(f"Error: Source directory '{source_dir}' does not exist.")
        return

    # Files and folders relative to source_dir to exclude from the zip file
    excludes = {
        "art",
        "dev",
        ".git",
        ".gitignore",
        ".gitattributes",
        "README.md",
        "PRIVACY_POLICY.md",
        "LICENSE",
        ".DS_Store"
    }

    print(f"Zipping '{source_dir}' into '{output_filename}'...")
    print(f"Excluding from ZIP: {sorted(list(excludes))}\n")
    
    count = 0
    with zipfile.ZipFile(output_filename, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(source_dir):
            # Compute relative root path from source_dir
            rel_root = os.path.relpath(root, source_dir)
            
            # Prevent walking into excluded directories
            dirs[:] = [d for d in dirs if d not in excludes]
            
            for file in files:
                # Exclude top-level excluded files
                if rel_root == "." and file in excludes:
                    continue
                # Always exclude .DS_Store files
                if file == ".DS_Store":
                    continue
                
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, start=source_dir)
                zipf.write(file_path, arcname)
                print(f"  Added: {arcname}")
                count += 1
                
    print(f"\nSuccessfully created '{output_filename}' with {count} files.")

if __name__ == "__main__":
    zip_extension()
