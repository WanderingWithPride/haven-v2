cmake_minimum_required(VERSION 3.22.1)
project("cyberdeck-server")

add_library(native-lib SHARED native-lib.cpp)

# Link against the Node.js shared library
add_library(node SHARED IMPORTED)
set_target_properties(node PROPERTIES IMPORTED_LOCATION
        ${CMAKE_SOURCE_DIR}/../jniLibs/${ANDROID_ABI}/libnode.so)

target_link_libraries(native-lib node log)
