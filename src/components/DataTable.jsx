export default function DataTable(){

const rows=Array.from(
{length:40},
(_,i)=>i+1
);

return(

<div className="table-box">

<table>

<thead>

<tr>

<th>NOTE</th>

<th>BLASH 1</th>

<th>BLASH 2</th>

<th>RETURN AC</th>

<th>DEPOSIT</th>

<th>BALANCE</th>

</tr>

</thead>

<tbody>

{rows.map(row=>(

<tr key={row}>

<td>
<input type="text"/>
</td>

<td>
<input type="number"/>
</td>

<td>
<input type="number"/>
</td>

<td>
<input type="number"/>
</td>

<td>
<input type="number"/>
</td>

<td>0</td>

</tr>

))}

</tbody>

</table>

</div>

);

}
