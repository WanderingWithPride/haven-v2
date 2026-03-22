package com.saro.cyberdeck.server;

public class NodeEngine {
    static {
        System.loadLibrary("c++_shared");
        System.loadLibrary("node");
        System.loadLibrary("native-lib");
    }

    public static native int startNode(String[] args);
    public static native void setEnv(String name, String value);
}
