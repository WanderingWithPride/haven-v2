#include <jni.h>
#include <string>
#include <vector>
#include <cstdlib>
#include <cstring>
#include <unistd.h>
#include <pthread.h>
#include <android/log.h>

#define LOG_TAG "NodeJS-Native"

namespace node {
    extern int Start(int argc, char** argv);
}

// Pipe logic for Logcat redirection
static int pfd[2];
static pthread_t thr;
static void* thread_func(void*) {
    ssize_t rdsz;
    char buf[128];
    while((rdsz = read(pfd[0], buf, sizeof(buf) - 1)) > 0) {
        if(buf[rdsz-1] == '\n') buf[--rdsz] = 0;
        buf[rdsz] = 0;
        __android_log_write(ANDROID_LOG_INFO, LOG_TAG, buf);
    }
    return 0;
}

int start_logger() {
    setvbuf(stdout, 0, _IOLBF, 0);
    setvbuf(stderr, 0, _IOLBF, 0);
    pipe(pfd);
    dup2(pfd[1], STDOUT_FILENO);
    dup2(pfd[1], STDERR_FILENO);
    if(pthread_create(&thr, 0, thread_func, 0) == -1) return -1;
    pthread_detach(thr);
    return 0;
}

extern "C" JNIEXPORT jint JNICALL
Java_com_saro_cyberdeck_server_NodeEngine_startNode(
        JNIEnv* env,
        jclass clazz,
        jobjectArray args) {

    jsize size = env->GetArrayLength(args);
    std::vector<char*> argv;
    argv.push_back(const_cast<char*>("node"));

    for (int i = 0; i < size; i++) {
        jstring arg = (jstring) env->GetObjectArrayElement(args, i);
        const char* str = env->GetStringUTFChars(arg, nullptr);
        argv.push_back(strdup(str));
        env->ReleaseStringUTFChars(arg, str);
    }

    argv.push_back(nullptr);

    start_logger();
    return node::Start(argv.size() - 1, argv.data());
}

extern "C" JNIEXPORT void JNICALL
Java_com_saro_cyberdeck_server_NodeEngine_setEnv(
        JNIEnv* env,
        jclass clazz,
        jstring name,
        jstring value) {
    const char* nameStr = env->GetStringUTFChars(name, nullptr);
    const char* valueStr = env->GetStringUTFChars(value, nullptr);

    setenv(nameStr, valueStr, 1);

    env->ReleaseStringUTFChars(name, nameStr);
    env->ReleaseStringUTFChars(value, valueStr);
}
