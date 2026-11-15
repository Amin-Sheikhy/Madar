/* Madar one-click Windows x64 launcher: freestanding, no C runtime.
 * Launch the SYSTEM32 WindowsPowerShell executable by absolute Unicode path;
 * the bootstrap receives this EXE's path via inherited environment only. */
typedef unsigned int DWORD;
typedef unsigned int UINT;
typedef int BOOL;
typedef __WCHAR_TYPE__ WCHAR;
typedef unsigned short WORD;
typedef unsigned char BYTE;

typedef struct {
 DWORD cb;
 WCHAR *lpReserved, *lpDesktop, *lpTitle;
 DWORD dwX, dwY, dwXSize, dwYSize, dwXCountChars, dwYCountChars;
 DWORD dwFillAttribute, dwFlags;
 WORD wShowWindow, cbReserved2;
 BYTE *lpReserved2;
 void *hStdInput, *hStdOutput, *hStdError;
} STARTUPINFOW;

typedef struct {
 void *hProcess, *hThread;
 DWORD dwProcessId, dwThreadId;
} PROCESS_INFORMATION;

extern DWORD __attribute__((ms_abi)) GetModuleFileNameW(void *, WCHAR *, DWORD);
extern UINT __attribute__((ms_abi)) GetSystemDirectoryW(WCHAR *, UINT);
extern BOOL __attribute__((ms_abi)) SetEnvironmentVariableW(const WCHAR *, const WCHAR *);
extern BOOL __attribute__((ms_abi)) CreateProcessW(const WCHAR *, WCHAR *, void *, void *,
 BOOL, DWORD, void *, const WCHAR *, STARTUPINFOW *, PROCESS_INFORMATION *);
extern BOOL __attribute__((ms_abi)) CloseHandle(void *);
extern void __attribute__((ms_abi,noreturn)) ExitProcess(UINT);

WCHAR selfPath[32768];
WCHAR powershellPath[1024];
WCHAR commandLine[32000];
STARTUPINFOW startup;
PROCESS_INFORMATION child;

#include "build/encoded_bootstrap.h"

static unsigned int copy_ascii(WCHAR *dest, unsigned int used, unsigned int capacity,
 const char *text) {
 for(;*text; ++text) {
  if(used + 1 >= capacity) return capacity;
  dest[used++] = (unsigned char)*text;
 }
 dest[used] = 0;
 return used;
}

static unsigned int copy_wide(WCHAR *dest, unsigned int used, unsigned int capacity,
 const WCHAR *text) {
 for(;*text; ++text) {
  if(used + 1 >= capacity) return capacity;
  dest[used++] = *text;
 }
 dest[used] = 0;
 return used;
}

void mainCRTStartup(void) {
 DWORD n=GetModuleFileNameW(0,selfPath,32768u);
 if(!n || n>=32768u) ExitProcess(1);
 if(!SetEnvironmentVariableW(L"MADAR453_INSTALLER_FILE",selfPath)) ExitProcess(2);

 UINT len=GetSystemDirectoryW(powershellPath,1024u);
 if(!len || len>=900u) ExitProcess(3);
 len=copy_ascii(powershellPath,len,1024u,"\\WindowsPowerShell\\v1.0\\powershell.exe");
 if(len>=1024u) ExitProcess(4);

 unsigned int pos=0;
 commandLine[pos++]=L'"';
 pos=copy_wide(commandLine,pos,32000u,powershellPath);
 if(pos+3u>=32000u) ExitProcess(5);
 commandLine[pos++]=L'"';commandLine[pos++]=L' ';
 pos=copy_ascii(commandLine,pos,32000u,MADAR453_BOOTSTRAP_ARGUMENTS);
 if(pos>=32000u) ExitProcess(6);

 startup.cb=(DWORD)sizeof(startup);
 if(!CreateProcessW(powershellPath,commandLine,0,0,0,0x00000010u,0,0,
    &startup,&child)) ExitProcess(7);
 CloseHandle(child.hThread);
 CloseHandle(child.hProcess);
 ExitProcess(0);
}
