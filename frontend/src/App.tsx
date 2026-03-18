import { useState, useEffect } from 'react'
import { createPublicClient, createWalletClient, http, isAddress, encodeFunctionData } from 'viem'
import { localhost } from 'viem/chains'
import { CONTRACT_ADDRESS, ABI } from './contract'
import './index.css'

const ADMIN_USER = import.meta.env.VITE_ADMIN_USER || "admin";
const ADMIN_PASS = import.meta.env.VITE_ADMIN_PASS || "voting_secure_2026";

type View = "login" | "register" | "dashboard";
type UserRole = "admin" | "student" | null;

function App() {
  // Auth & View State
  const [view, setView] = useState<View>("login");
  const [role, setRole] = useState<UserRole>(null);
  const [userAddress, setUserAddress] = useState<string>("");
  const [userName, setUserName] = useState<string>("");

  // Login/Register Form State
  const [loginId, setLoginId] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [regName, setRegName] = useState("");
  const [regEnroll, setRegEnroll] = useState("");
  const [regAddr, setRegAddr] = useState("");
  const [regPass, setRegPass] = useState("");

  // Contract Data State
  const [electionName, setElectionName] = useState("");
  const [electionActive, setElectionActive] = useState(false);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [registeredStudents, setRegisteredStudents] = useState<any[]>([]);
  const [voterInfo, setVoterInfo] = useState({ authorized: false, voted: false, name: "", enrollment: "" });
  const [loading, setLoading] = useState(false);
  const [newCandidateName, setNewCandidateName] = useState("");

  const rpcUrl = "http://127.0.0.1:7545";

  const publicClient = createPublicClient({
    chain: localhost,
    transport: http(rpcUrl)
  });

  const getWalletClient = (addr: string) => {
    return createWalletClient({
      chain: localhost,
      transport: http(rpcUrl),
      account: addr as `0x${string}`
    });
  };

  const fetchData = async () => {
    try {
      const [name, active, adminAddr, currentCandidates, studentAddrs] = await Promise.all([
        publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ABI, functionName: 'electionName' }),
        publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ABI, functionName: 'electionActive' }),
        publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ABI, functionName: 'admin' }),
        publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ABI, functionName: 'getCandidates' }),
        publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ABI, functionName: 'getVoterAddresses' })
      ]);

      const students = await Promise.all((studentAddrs as string[]).map(async (addr) => {
        const detail = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: ABI,
          functionName: 'voters',
          args: [addr as `0x${string}`]
        });
        return { address: addr, authorized: detail[0], voted: detail[1], name: detail[3], enrollment: detail[4], registered: detail[5] };
      }));

      setElectionName(name as string);
      setElectionActive(active as boolean);
      setCandidates(currentCandidates as any[]);
      setRegisteredStudents(students);

      if (userAddress && isAddress(userAddress)) {
        const info = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: ABI,
          functionName: 'voters',
          args: [userAddress as `0x${string}`]
        });
        setVoterInfo({ authorized: info[0], voted: info[1], name: info[3], enrollment: info[4] });
      }
    } catch (err) {
      console.error("Failed to fetch contract data", err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [userAddress]);

  // --- Auth Logic ---

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginId === ADMIN_USER && loginPass === ADMIN_PASS) {
      setRole("admin");
      setUserAddress("0xb94b69144b3eccf1303b5add01a02ee049c46e10"); // Set to Ganache Admin (Account 0)
      setUserName("Admin");
      setView("dashboard");
      return;
    }

    // Student Login via LocalStorage lookup
    let targetId = loginId.toLowerCase();

    // Check if loginId is an address. If not, try to resolve from enrollment mapping.
    if (!isAddress(targetId)) {
      const mappedAddr = localStorage.getItem(`enroll_to_addr_${targetId}`);
      if (mappedAddr) {
        console.log(`[DEBUG] Resolved enrollment ${targetId} to ${mappedAddr}`);
        targetId = mappedAddr;
      }
    }

    const stored = localStorage.getItem(`voter_auth_${targetId}`);
    if (stored) {
      const authData = JSON.parse(stored);
      if (authData.password === loginPass) {
        setRole("student");
        setUserAddress(targetId);
        setUserName(authData.name);
        setView("dashboard");
        return;
      }
    }
    alert("Invalid credentials or account not registered locally.");
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAddress(regAddr)) return alert("Invalid Wallet Address");
    setLoading(true);
    try {
      const client = getWalletClient(regAddr);
      const data = encodeFunctionData({
        abi: ABI,
        functionName: 'registerVoter',
        args: [regName, regEnroll],
      });
      await client.request({
        method: 'eth_sendTransaction',
        params: [{ from: regAddr as `0x${string}`, to: CONTRACT_ADDRESS, data, gas: '0xF4240' }]
      });

      // Store password for login
      localStorage.setItem(`voter_auth_${regAddr.toLowerCase()}`, JSON.stringify({
        password: regPass,
        name: regName,
        enrollment: regEnroll,
        registered: true
      }));

      // Store enrollment to address mapping for identifier-based login
      localStorage.setItem(`enroll_to_addr_${regEnroll.toLowerCase()}`, regAddr.toLowerCase());

      alert("Registration successful! You are now in the unauthorized list. Ask the admin to authorize you.");
      setView("login");
    } catch (err: any) {
      alert("Registration failed: " + (err.shortMessage || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setRole(null);
    setUserAddress("");
    setUserName("");
    setView("login");
    setLoginId("");
    setLoginPass("");
  };

  // --- Contract Actions ---

  const handleToggleAuth = async (addr: string, status: boolean) => {
    console.log(`Setting auth for ${addr} to ${status}`);
    setLoading(true);
    try {
      const client = getWalletClient(userAddress);
      const { request } = await publicClient.simulateContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'setVoterAuthorization',
        args: [addr as `0x${string}`, status],
        account: userAddress as `0x${string}`,
      });
      const hash = await client.writeContract(request);
      console.log("Transaction sent:", hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") throw new Error("Transaction reverted on-chain");
      console.log("Transaction confirmed");
      fetchData();
    } catch (err: any) {
      console.error("Action failed:", err);
      alert("Action failed: " + (err.shortMessage || err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const handleAddCandidate = async () => {
    if (!newCandidateName) return;
    console.log(`Adding candidate: ${newCandidateName}`);
    setLoading(true);
    try {
      const client = getWalletClient(userAddress);
      const { request } = await publicClient.simulateContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'addCandidate',
        args: [newCandidateName],
        account: userAddress as `0x${string}`,
      });
      const hash = await client.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") throw new Error("Transaction reverted on-chain");
      setNewCandidateName("");
      fetchData();
    } catch (err: any) {
      console.error("Add candidate failed:", err);
      alert("Add failed: " + (err.shortMessage || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleStartElection = async () => {
    console.log("Starting election");
    setLoading(true);
    try {
      const client = getWalletClient(userAddress);
      const { request } = await publicClient.simulateContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'startElection',
        account: userAddress as `0x${string}`,
      });
      const hash = await client.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") throw new Error("Transaction reverted on-chain");
      fetchData();
    } catch (err: any) {
      console.error("Start failed:", err);
      alert("Start failed: " + (err.shortMessage || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleEndElection = async () => {
    console.log("Ending election");
    setLoading(true);
    try {
      const client = getWalletClient(userAddress);
      const { request } = await publicClient.simulateContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'endElection',
        account: userAddress as `0x${string}`,
      });
      const hash = await client.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") throw new Error("Transaction reverted on-chain");
      fetchData();
    } catch (err: any) {
      console.error("End failed:", err);
      alert("End failed: " + (err.shortMessage || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleVote = async (index: number) => {
    console.log(`Casting vote for candidate ${index}`);
    setLoading(true);
    try {
      const client = getWalletClient(userAddress);
      const { request } = await publicClient.simulateContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'vote',
        args: [BigInt(index)],
        account: userAddress as `0x${string}`,
      });
      const hash = await client.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") throw new Error("Transaction reverted on-chain");
      alert("Vote casted successfully!");
      fetchData();
    } catch (err: any) {
      console.error("Vote failed:", err);
      alert("Vote failed: " + (err.shortMessage || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleResetElection = async (clearCandidates: boolean) => {
    console.log(`[DEBUG] Reset button clicked: clearCandidates=${clearCandidates}`);
    console.log(`[DEBUG] Current userAddress: ${userAddress}`);

    setLoading(true);
    try {
      const client = getWalletClient(userAddress);
      console.log(`[DEBUG] Simulating resetElection...`);
      const { request } = await publicClient.simulateContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'resetElection',
        args: [clearCandidates],
        account: userAddress as `0x${string}`,
      });

      console.log(`[DEBUG] Simulation successful. Sending transaction...`);
      const hash = await client.writeContract(request);
      console.log(`[DEBUG] Transaction sent. Hash: ${hash}`);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`[DEBUG] Transaction mined. Status: ${receipt.status}`);

      if (receipt.status === "reverted") {
        throw new Error("Blockchain reverted the transaction. Check if you are the admin and the election is inactive.");
      }

      alert(`Success: Election ${clearCandidates ? 'fully reset' : 'votes cleared'}.`);
      fetchData();
    } catch (err: any) {
      console.error("[DEBUG] Reset error:", err);
      alert("Reset failed: " + (err.shortMessage || err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const getWinners = () => {
    if (!candidates || candidates.length === 0) return [];
    let maxVotes = 0n;
    candidates.forEach(c => {
      try {
        const v = BigInt(c.voteCount || 0n);
        if (v > maxVotes) maxVotes = v;
      } catch (e) { }
    });
    if (maxVotes === 0n) return [];
    return candidates.filter(c => {
      try {
        return BigInt(c.voteCount || 0n) === maxVotes;
      } catch (e) { return false; }
    });
  };

  const winners = !electionActive && (candidates.some(c => {
    try { return BigInt(c.voteCount || 0n) > 0n; } catch (e) { return false; }
  })) ? getWinners() : [];

  // --- Render Views ---

  if (view === "login") {
    return (
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '90vh' }}>
        <div className="glass-card" style={{ width: '400px', textAlign: 'center' }}>
          <h1>🗳️ Welcome</h1>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}>
            <input placeholder="Username or Wallet Address" value={loginId} onChange={e => setLoginId(e.target.value)} required />
            <input type="password" placeholder="Password" value={loginPass} onChange={e => setLoginPass(e.target.value)} required />
            <button className="btn" type="submit">Login</button>
          </form>
          <div style={{ marginTop: '1.5rem', fontSize: '0.9rem' }}>
            New student? <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem' }} onClick={() => setView("register")}>Register Here</button>
          </div>
        </div>
      </div>
    );
  }

  if (view === "register") {
    return (
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '90vh' }}>
        <div className="glass-card" style={{ width: '450px' }}>
          <h1 style={{ textAlign: 'center' }}>📝 Student Registration</h1>
          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '2rem' }}>
            <input placeholder="Full Name" value={regName} onChange={e => setRegName(e.target.value)} required />
            <input placeholder="Enrollment Number" value={regEnroll} onChange={e => setRegEnroll(e.target.value)} required />
            <input placeholder="Wallet Address (0x...)" value={regAddr} onChange={e => setRegAddr(e.target.value)} required />
            <input type="password" placeholder="Create Password" value={regPass} onChange={e => setRegPass(e.target.value)} required />
            <button className="btn" type="submit" disabled={loading}>Register on Blockchain</button>
            <button className="btn btn-secondary" type="button" onClick={() => setView("login")}>Back to Login</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <header style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ marginBottom: '0.5rem' }}>{electionName || "CR Voting System"}</h1>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>Logged in as: <strong>{userName}</strong> ({role})</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {electionActive ? <span className="badge badge-active">ELECTION LIVE</span> : <span className="badge badge-ended">ENDED</span>}
          <button className="btn btn-secondary" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {winners.length > 0 && !electionActive && (
        <div className="glass-card" style={{ textAlign: 'center', border: '2px solid gold', background: 'rgba(255, 215, 0, 0.05)', marginBottom: '2rem' }}>
          <h2 style={{ color: 'gold' }}>🏆 {winners.length > 1 ? "ELECTION TIE" : "ELECTION WINNER"} 🏆</h2>
          <div style={{ fontSize: winners.length > 2 ? '2rem' : '3rem' }}>{winners.map(w => w.name).join(" & ")}</div>
          {role === "admin" && <div style={{ fontSize: '1.25rem', color: 'var(--text-dim)' }}>Won with {winners[0].voteCount.toString()} votes</div>}
        </div>
      )}

      <div className="grid">
        <div className="glass-card">
          <h2>Candidates</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {candidates.map((c: any, index: number) => (
              <div key={index} className="candidate-card">
                <div>
                  <div style={{ fontWeight: 600 }}>{c.name}</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-dim)' }}>Candidate ID: {index}</div>
                </div>
                {electionActive && voterInfo.authorized && !voterInfo.voted && role === "student" && (
                  <button className="btn" disabled={loading} onClick={() => handleVote(index)}>Vote</button>
                )}
              </div>
            ))}
            {candidates.length === 0 && <div style={{ color: 'var(--text-dim)' }}>No candidates yet.</div>}
          </div>

          {role === "student" && (
            <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '1rem', border: '1px solid var(--glass-border)' }}>
              <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Your Voter Status</h3>
              {voterInfo.authorized ? (
                <div style={{ fontSize: '0.9rem', lineHeight: '1.6' }}>
                  <div><strong>Name:</strong> {voterInfo.name}</div>
                  <div><strong>Enrollment:</strong> {voterInfo.enrollment}</div>
                  <div style={{ marginTop: '0.5rem' }}>
                    Status: {voterInfo.voted ? <span style={{ color: 'var(--success)' }}>Voted ✅</span> : "Ready to vote ⏳"}
                  </div>
                </div>
              ) : (
                <div style={{ color: 'var(--error)', fontSize: '0.9rem' }}>
                  You are registered but not yet authorized by the admin. Please wait.
                </div>
              )}
            </div>
          )}
        </div>

        {role === "admin" && (
          <div className="glass-card">
            <h2 style={{ color: '#c084fc' }}>Admin Office</h2>

            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1rem', borderLeft: '3px solid var(--primary)', paddingLeft: '0.5rem', marginBottom: '1rem' }}>Manage Candidates</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input placeholder="Candidate Name" value={newCandidateName} onChange={e => setNewCandidateName(e.target.value)} disabled={electionActive} />
                <button className="btn" onClick={handleAddCandidate} disabled={loading || electionActive || !newCandidateName}>Add</button>
              </div>
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1rem', borderLeft: '3px solid var(--primary)', paddingLeft: '0.5rem', marginBottom: '1rem' }}>Live Results</h3>
              <div style={{ padding: '0.75rem', background: 'rgba(0,0,0,0.1)', borderRadius: '0.5rem' }}>
                {candidates.map((c, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                    <span>{c.name}</span>
                    <span style={{ fontWeight: 'bold' }}>{c.voteCount.toString()} votes</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1rem', color: 'var(--error)', borderLeft: '3px solid var(--error)', paddingLeft: '0.5rem', marginBottom: '1rem' }}>Unauthorized Students</h3>
              <div className="voter-list">
                {registeredStudents.filter(s => !s.authorized).map(s => (
                  <div key={s.address} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.5rem', marginBottom: '0.5rem' }}>
                    <div style={{ fontSize: '0.85rem' }}><strong>{s.name}</strong> ({s.enrollment})</div>
                    <button className="btn" style={{ padding: '0.25rem 0.5rem', background: 'var(--success)' }} onClick={() => handleToggleAuth(s.address, true)}>✔️ Auth</button>
                  </div>
                ))}
                {registeredStudents.filter(s => !s.authorized).length === 0 && <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>None</div>}
              </div>
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1rem', color: 'var(--success)', borderLeft: '3px solid var(--success)', paddingLeft: '0.5rem', marginBottom: '1rem' }}>Authorized Students</h3>
              <div className="voter-list">
                {registeredStudents.filter(s => s.authorized).map(s => (
                  <div key={s.address} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.5rem', marginBottom: '0.5rem' }}>
                    <div style={{ fontSize: '0.85rem' }}><strong>{s.name}</strong> ({s.enrollment})</div>
                    <button className="btn" style={{ padding: '0.25rem 0.5rem', background: 'var(--error)' }} onClick={() => handleToggleAuth(s.address, false)}>❌ Unauth</button>
                  </div>
                ))}
                {registeredStudents.filter(s => s.authorized).length === 0 && <div style={{ fontSize: '0.8rem', opacity: 0.5 }}>None</div>}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1.5rem' }}>
              {!electionActive ? (
                <button className="btn" style={{ background: 'var(--success)', flex: 1 }} onClick={handleStartElection} disabled={loading || candidates.length === 0}>Launch Election</button>
              ) : (
                <button className="btn" style={{ background: 'var(--error)', flex: 1 }} onClick={handleEndElection} disabled={loading}>Terminate Election</button>
              )}
            </div>

            {!electionActive && (
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button disabled={loading} className="btn" style={{ background: '#475569', flex: 1, fontSize: '0.8rem' }} onClick={() => handleResetElection(false)}>Reset Votes</button>
                <button disabled={loading} className="btn" style={{ background: '#334155', flex: 1, fontSize: '0.8rem' }} onClick={() => handleResetElection(true)}>Fresh Start</button>
              </div>
            )}
          </div>
        )}
      </div>

      {loading && (
        <div style={{ position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 100 }} className="glass-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div className="loading-spinner"></div>
            <span>Blockchain Sync...</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
