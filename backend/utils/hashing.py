import hashlib

def calculate_file_hash(file_handle):
    """
    Calculates the SHA-256 hash of a file.
    Expects a Django UploadedFile or any file-like object.
    """
    sha256_hash = hashlib.sha256()
    # Ensure we start from the beginning if the file was already read
    file_handle.seek(0)
    for byte_block in iter(lambda: file_handle.read(4096), b""):
        sha256_hash.update(byte_block)
    # Reset seek for subsequent uses (e.g. saving the file)
    file_handle.seek(0)
    return sha256_hash.hexdigest()
